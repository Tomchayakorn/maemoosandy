import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { findPackage } from "@/lib/packages";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRpcError } from "@/types/database";
import { notifyAdminLine } from "@/lib/line-notify";
import { shopReceiver } from "@/lib/slip/receiver";
import { checkSlip } from "@/lib/slip/checks";
import { getSlipProvider, SLIP_ERROR_MESSAGE, type SlipErrorCode, type TopupVerifyResponse } from "@/lib/slip";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // EasySlip's limit; SlipOK accepts the same types
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const HTTP_FOR: Record<SlipErrorCode, number> = {
  NOT_CONFIGURED: 503,
  BAD_IMAGE: 400,
  NOT_A_SLIP: 422,
  SLIP_PENDING: 409,
  DUPLICATE: 400,
  AMOUNT_MISMATCH: 422,
  RECEIVER_MISMATCH: 422,
  TOO_OLD: 422,
  PROVIDER_ERROR: 502,
};

export async function POST(request: Request) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "topupVerify");
  if (limited) return limited;

  // ---- 1) Validate the form: package id + slip image (prices come from PACKAGES, never the client)
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "BAD_FORM", "ข้อมูลที่ส่งมาไม่ถูกต้องค่ะ");
  }
  const pkg = findPackage(String(form.get("packageId") ?? ""));
  if (!pkg) return apiError(400, "BAD_PACKAGE", "กรุณาเลือกแพ็กเกจก่อนนะคะ");

  const file = form.get("slip");
  if (!(file instanceof File) || file.size === 0) return apiError(400, "NO_SLIP", "กรุณาแนบรูปสลิปการโอนค่ะ");
  const ext = ALLOWED_TYPES[file.type];
  if (!ext || file.size > MAX_BYTES) return apiError(400, "BAD_IMAGE", SLIP_ERROR_MESSAGE.BAD_IMAGE);

  const provider = getSlipProvider();
  if (!provider) return apiError(503, "NOT_CONFIGURED", SLIP_ERROR_MESSAGE.NOT_CONFIGURED);

  const admin = createAdminClient();

  // ---- 2) Keep a copy of the slip (private bucket) for the audit trail
  const slipPath = `${user.id}/${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${ext}`;
  const upload = await admin.storage.from("slips").upload(slipPath, file, { contentType: file.type, upsert: false });
  if (upload.error) console.error("topup: slip upload failed", upload.error.message);
  const storedPath = upload.error ? null : slipPath;

  const recordFailure = async (code: SlipErrorCode, detail: string | undefined, transRef: string | null) => {
    // slip_ref stays null on failures, so the same slip can still be credited later
    // (e.g. after the customer picks the package that matches the amount they paid).
    const { error } = await admin.from("transactions").insert({
      user_id: user.id,
      package_id: pkg.id,
      amount_thb: pkg.priceThb,
      coins_added: 0,
      status: code === "PROVIDER_ERROR" || code === "NOT_CONFIGURED" ? "failed" : "rejected",
      provider: provider.name,
      charge_id: transRef,
      slip_path: storedPath,
      failure_reason: `${code}${detail ? `: ${detail}` : ""}`.slice(0, 500),
    });
    if (error) console.error("topup: failed to record failure", error.message);
  };

  const fail = async (code: SlipErrorCode, detail?: string, transRef: string | null = null) => {
    await recordFailure(code, detail, transRef);
    return apiError(HTTP_FOR[code], code, SLIP_ERROR_MESSAGE[code]);
  };

  // ---- 3) Read the slip with the provider
  const result = await provider.verify({ file, fileName: `slip.${ext}`, expectedAmount: pkg.priceThb });
  if (!result.ok) {
    if (result.code === "PROVIDER_ERROR") console.error("topup: provider error", provider.name, result.detail);
    return fail(result.code, result.detail);
  }
  const slip = result.slip;

  // ---- 4) Our own checks: exact amount, receiver is us, recent
  const check = checkSlip(slip, {
    expectedAmount: pkg.priceThb,
    receiver: shopReceiver(slip.receiverName),
    now: new Date(),
    maxAgeHours: Number(process.env.SLIP_MAX_AGE_HOURS) || 24,
  });
  if (!check.ok) {
    if (check.code === "NOT_CONFIGURED") console.error("topup: receiver not configured —", check.detail);
    return fail(check.code, check.detail, slip.transRef);
  }

  // ---- 5) Credit atomically; slip_ref is UNIQUE so a slip can never be credited twice
  const credit = await admin.rpc("credit_topup", {
    p_user_id: user.id,
    p_package_id: pkg.id,
    p_amount_thb: pkg.priceThb,
    p_coins: pkg.coins,
    p_slip_ref: slip.transRef,
    p_slip_path: storedPath ?? "",
    p_provider: slip.provider,
    p_charge_id: slip.providerRef ?? slip.transRef,
  });
  if (credit.error) {
    if (parseRpcError(credit.error.message) === "SLIP_ALREADY_USED") {
      return fail("DUPLICATE", "slip_ref already credited to another account", slip.transRef);
    }
    console.error("topup: credit_topup failed", credit.error.message);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งค่ะ");
  }

  const data = credit.data as { coins_added: number; balance: number; already_credited: boolean };
  if (!data.already_credited) {
    await notifyAdminLine(
      `💰 เติมเหรียญสำเร็จ\nยอด: ${pkg.priceThb} บาท → ${data.coins_added} เหรียญ\nผู้ใช้: ${user.email ?? user.id}\nอ้างอิงสลิป: ${slip.transRef}\nยอดคงเหลือ: ${data.balance}`,
    );
  }
  return NextResponse.json<TopupVerifyResponse>({
    ok: true,
    coinsAdded: data.coins_added,
    balance: data.balance,
    alreadyCredited: data.already_credited,
    packageId: pkg.id,
  });
}
