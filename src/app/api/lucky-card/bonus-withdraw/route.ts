import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { notifyAdminLine } from "@/lib/line-notify";
import { getSiteUrl } from "@/lib/site-url";
import type { LuckyCardBonusWithdrawResponse } from "@/lib/lucky-card/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  bankName: z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(80),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6,20}$/, "เลขที่บัญชีต้องเป็นตัวเลข 6-20 หลัก")),
  accountName: z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุลเจ้าของบัญชี").max(120),
});

/**
 * Request the cash-out of 1,000 accumulated "ดวงดี มีเฮ" bonus coins (= 1,000 THB). The body carries ONLY bank details:
 * amount, eligibility and the user all come from the server. The RPC is idempotent while a request is pending, so a double
 * click or a lost connection returns the same request instead of creating another. The 1,000 accumulated coins are reserved (deducted) right away and refunded only if the admin rejects.
 */
export async function POST(request: Request) {
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    const limited = rateLimitResponse(user.id, "luckyCardWithdraw");
    if (limited) return limited;

    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("request_lucky_card_bonus_withdrawal", {
      p_user_id: user.id,
      p_bank_name: body.bankName,
      p_account_number: body.accountNumber,
      p_account_name: body.accountName,
    });
    if (error) return rpcErrorResponse(error);

    const r = data as { request_id: string; amount_thb: number; bonus_total: number; already_pending: boolean };
    if (!r.already_pending) {
      const site = getSiteUrl();
      await notifyAdminLine(
        [
          `💰 คำขอถอน [ยอดโบนัสสะสมเกม ดวงดี มีเฮ] ${r.amount_thb.toLocaleString("th-TH")} บาท`,
          `ประเภท: โบนัสสะสมครบ 1,000 เหรียญ (หักยอดสะสมของเกมไว้แล้ว 1,000 ไม่กระทบกระเป๋าหลัก ปฏิเสธ = คืนให้)`,
          `รหัสอ้างอิง: ${r.request_id}`,
          `ธนาคาร: ${body.bankName}`,
          `เลขที่บัญชี: ${body.accountNumber}`,
          `ชื่อบัญชี: ${body.accountName}`,
          `ผู้ใช้: ${user.email ?? user.id}`,
          `ตรวจสอบ: ${site}/admin/withdrawals`,
        ].join("\n"),
      );
    }
    return NextResponse.json<LuckyCardBonusWithdrawResponse>({
      requestId: r.request_id,
      amountThb: r.amount_thb,
      alreadyPending: r.already_pending,
      bonusTotal: r.bonus_total,
    });
  } catch (e) {
    console.error("lucky-card bonus-withdraw: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
