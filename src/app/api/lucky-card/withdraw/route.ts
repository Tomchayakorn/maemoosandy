import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireUser, rpcErrorResponse, apiError } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { notifyAdminLine } from "@/lib/line-notify";
import { getSiteUrl } from "@/lib/site-url";
import type { LuckyCardWithdrawResponse } from "@/lib/lucky-card/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  prizeId: z.string().uuid("สิทธิ์รางวัลไม่ถูกต้อง"),
  bankName: z.string().trim().min(1, "กรุณาเลือกธนาคาร").max(80),
  accountNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{6,20}$/, "เลขที่บัญชีต้องเป็นตัวเลข 6-20 หลัก")),
  accountName: z.string().trim().min(1, "กรุณากรอกชื่อ-นามสกุลเจ้าของบัญชี").max(120),
});

/**
 * Withdraw a "เทพประทานทรัพย์" prize (now, or later from /withdraw). The amount comes from the stored
 * prize row, never from the request; the RPC locks the prize so it can be withdrawn exactly once.
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
    const { data, error } = await admin.rpc("request_lucky_card_withdrawal", {
      p_user_id: user.id,
      p_prize_id: body.prizeId,
      p_bank_name: body.bankName,
      p_account_number: body.accountNumber,
      p_account_name: body.accountName,
    });
    if (error) return rpcErrorResponse(error);

    const r = data as { request_id: string; amount_thb: number };
    const site = getSiteUrl();
    await notifyAdminLine(
      [
        `💰 คำขอถอนรางวัล "เทพประทานทรัพย์" ${r.amount_thb.toLocaleString("th-TH")} บาท`,
        `รหัสอ้างอิง: ${r.request_id}`,
        `ธนาคาร: ${body.bankName}`,
        `เลขที่บัญชี: ${body.accountNumber}`,
        `ชื่อบัญชี: ${body.accountName}`,
        `ผู้ใช้: ${user.email ?? user.id}`,
        `ตรวจสอบ: ${site}/admin/withdrawals`,
      ].join("\n"),
    );
    return NextResponse.json<LuckyCardWithdrawResponse>({ requestId: r.request_id, amountThb: r.amount_thb });
  } catch (e) {
    console.error("lucky-card withdraw: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
