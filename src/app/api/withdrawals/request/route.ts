import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRpcError } from "@/types/database";
import { notifyAdminLine } from "@/lib/line-notify";
import { getSiteUrl } from "@/lib/site-url";
import { createLocalRequest, shouldUseLocalWithdrawals } from "@/lib/withdrawals-local";
import { WITHDRAW_COINS } from "@/lib/withdrawals";

const Body = z.object({
  bankName: z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(80),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6,20}$/, "เลขที่บัญชีต้องเป็นตัวเลข 6-20 หลัก")),
  accountName: z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุลเจ้าของบัญชี").max(120),
});

const NOT_ENOUGH = "ยอดเหรียญคงเหลือไม่ถึง 5,000 เหรียญ ไม่สามารถทำรายการถอนได้";

/** Request the fixed 5,000-coin jackpot withdrawal. Amount is server-side; user comes from the session only. */
export async function POST(request: Request) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "withdrawRequest");
  if (limited) return limited;

  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;

  const admin = createAdminClient();

  let r: { request_id: string; balance: number; jackpot_withdrawals_available: number };
  if (await shouldUseLocalWithdrawals(admin)) {
    const out = await createLocalRequest(admin, user, body);
    if ("error" in out) {
      if (out.error === "INSUFFICIENT_COINS") return apiError(400, "INSUFFICIENT_COINS", NOT_ENOUGH);
      if (out.error === "NO_WITHDRAWAL_QUOTA") return apiError(403, "NO_WITHDRAWAL_QUOTA", "คุณไม่มีสิทธิ์ถอนรางวัลแจ็กพอต");
      return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
    }
    r = { request_id: out.requestId, balance: out.balance, jackpot_withdrawals_available: out.quota };
    return await finish(request, user, body, r);
  }

  // Friendly pre-checks; the RPC re-checks everything under the wallet row lock.
  const { data: wallet } = await admin
    .from("wallets")
    .select("balance, jackpot_withdrawals_available")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!wallet) return apiError(404, "WALLET_NOT_FOUND", "ไม่พบกระเป๋าเหรียญของบัญชีนี้");
  if (wallet.jackpot_withdrawals_available < 1) {
    return apiError(403, "NO_WITHDRAWAL_QUOTA", "คุณไม่มีสิทธิ์ถอนรางวัลแจ็กพอต");
  }
  if (wallet.balance < WITHDRAW_COINS) return apiError(400, "INSUFFICIENT_COINS", NOT_ENOUGH);

  const { data, error } = await admin.rpc("request_jackpot_withdrawal", {
    p_user_id: user.id,
    p_bank_name: body.bankName,
    p_account_number: body.accountNumber,
    p_account_name: body.accountName,
  });
  if (error) {
    if (parseRpcError(error.message) === "INSUFFICIENT_COINS") return apiError(400, "INSUFFICIENT_COINS", NOT_ENOUGH);
    return rpcErrorResponse(error);
  }

  r = data as { request_id: string; balance: number; jackpot_withdrawals_available: number };
  return await finish(request, user, body, r);
}

async function finish(
  request: Request,
  user: { id: string; email?: string | null },
  body: { bankName: string; accountNumber: string; accountName: string },
  r: { request_id: string; balance: number; jackpot_withdrawals_available: number },
) {
  const site = getSiteUrl();
  await notifyAdminLine(
    [
      "💰 คำขอถอนรางวัลแจ็กพอต 5,000 บาท",
      `รหัสอ้างอิง: ${r.request_id}`,
      `ธนาคาร: ${body.bankName}`,
      `เลขที่บัญชี: ${body.accountNumber}`,
      `ชื่อบัญชี: ${body.accountName}`,
      `ผู้ใช้: ${user.email ?? user.id}`,
      `ตรวจสอบ: ${site}/admin/withdrawals`,
    ].join("\n"),
  );

  return NextResponse.json({
    requestId: r.request_id,
    balance: r.balance,
    jackpotWithdrawalsAvailable: r.jackpot_withdrawals_available,
  });
}
