import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { notifyAdminLine } from "@/lib/line-notify";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { WHEEL_CASH_BIG, WHEEL_CASH_LIMITS, WHEEL_CASH_SMALL } from "@/lib/wheel/cash";

export type WheelCashWithdrawResponse = { requestId: string; amountThb: number; alreadyPending: boolean; wheelCashTotal: number };

const Body = z.object({
  tier: z.union([z.literal(WHEEL_CASH_SMALL), z.literal(WHEEL_CASH_BIG)], { message: "ขั้นถอนไม่ถูกต้อง" }),
  bankName: z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(80),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6,20}$/, "เลขที่บัญชีต้องเป็นตัวเลข 6-20 หลัก")),
  accountName: z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุลเจ้าของบัญชี").max(120),
});

/**
 * Cash out "ยอดสะสมจากการหมุนเกม": tier 500 (quota per Bangkok day/week) or 5,000 (no quota, admin approves). The body carries only the
 * tier and bank details — user, tally, limits and amount come from the session/database/server constants. The RPC locks the wallet,
 * returns the existing request while one is pending (no double reservation), enforces the quota and RESERVES the tier immediately
 * (refunded if the admin rejects). The main wallet is never touched.
 */
export async function POST(request: Request) {
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    const limited = rateLimitResponse(user.id, "wheelCashWithdraw");
    if (limited) return limited;

    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const { data, error } = await createAdminClient().rpc("request_wheel_cash_withdrawal", {
      p_user_id: user.id,
      p_tier: body.tier,
      p_bank_name: body.bankName,
      p_account_number: body.accountNumber,
      p_account_name: body.accountName,
      p_daily_limit: WHEEL_CASH_LIMITS.perDay,
      p_weekly_limit: WHEEL_CASH_LIMITS.perWeek,
    });
    if (error) return rpcErrorResponse(error);

    const r = data as { request_id: string; amount_thb: number; wheel_cash_total: number; already_pending: boolean };
    if (!r.already_pending) {
      await notifyAdminLine(
        [
          `💰 คำขอถอน [ยอดสะสมจากกงล้อ] ${r.amount_thb.toLocaleString("th-TH")} บาท (ขั้น ${r.amount_thb === WHEEL_CASH_BIG ? "ใหญ่" : "ย่อย"})`,
          `ประเภท: ยอดสะสมจากการหมุนเกม (หักยอดสะสมไว้แล้ว ไม่กระทบกระเป๋าหลัก ปฏิเสธ = คืนให้)`,
          `รหัสอ้างอิง: ${r.request_id}`,
          `ธนาคาร: ${body.bankName}`,
          `เลขที่บัญชี: ${body.accountNumber}`,
          `ชื่อบัญชี: ${body.accountName}`,
          `ผู้ใช้: ${user.email ?? user.id}`,
          `ตรวจสอบ: ${getSiteUrl()}/admin/withdrawals`,
        ].join("\n"),
      );
    }
    return NextResponse.json<WheelCashWithdrawResponse>({
      requestId: r.request_id,
      amountThb: r.amount_thb,
      alreadyPending: r.already_pending,
      wheelCashTotal: r.wheel_cash_total,
    });
  } catch (e) {
    console.error("lucky-wheel cash-withdraw: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
