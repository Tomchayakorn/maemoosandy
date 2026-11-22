import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidVoucherCode, normalizeVoucherCode } from "@/lib/voucher";

const Body = z.object({ code: z.string().min(1, "กรอกโค้ดก่อนนะคะ").max(80) });

export type VoucherRedeemResponse = { coins: number; balance: number };

/**
 * Redeem a "โค้ดลับจากแม่มู". Only the typed code comes from the client; the user is the verified session. The RPC `redeem_voucher`
 * (migration 0019) checks active / expiry / one-use-per-account / total uses under row locks and credits the coins in ONE transaction.
 */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "voucherRedeem");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const code = normalizeVoucherCode(body.code);
    if (!isValidVoucherCode(code)) return apiError(404, "VOUCHER_NOT_FOUND", "โค้ดไม่ถูกต้องค่ะ ตรวจตัวอักษรอีกครั้งนะคะ");

    const { data, error } = await createAdminClient().rpc("redeem_voucher", { p_user_id: user.id, p_code: code });
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "redeem_voucher (กรอกโค้ดลับ)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    const r = data as { coins: number; balance: number };
    return NextResponse.json<VoucherRedeemResponse>({ coins: r.coins, balance: r.balance });
  } catch (e) {
    console.error("voucher redeem: unhandled exception", e);
    await alertAdminError({ where: "POST /api/voucher/redeem (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง (ยังไม่มีการเพิ่มเหรียญ)");
  }
}
