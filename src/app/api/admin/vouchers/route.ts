import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { alertAdminError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bangkokLocalToIso, generateVoucherCode, isValidVoucherCode, normalizeVoucherCode, VOUCHER_COINS_MAX, VOUCHER_USES_MAX,
} from "@/lib/voucher";

const Body = z.object({
  code: z.string().max(40).optional(), // empty = generate one
  coins: z.number().int().min(1, "จำนวนเหรียญต้องมากกว่า 0").max(VOUCHER_COINS_MAX, `เหรียญต่อโค้ดสูงสุด ${VOUCHER_COINS_MAX.toLocaleString("th-TH")}`),
  maxRedemptions: z.number().int().min(1, "จำนวนสิทธิ์ต้องมากกว่า 0").max(VOUCHER_USES_MAX, `จำนวนสิทธิ์สูงสุด ${VOUCHER_USES_MAX.toLocaleString("th-TH")}`),
  expiresAtLocal: z.string().min(1, "กำหนดวัน/เวลาหมดอายุ"), // datetime-local, Bangkok time
  note: z.string().trim().max(200).optional(),
});

/** Admin only: create a voucher code. All limits are validated here and again by the table's CHECK constraints. */
export async function POST(request: Request) {
  const ctx: { admin?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
    ctx.admin = user.id;
    const limited = rateLimitResponse(user.id, "adminReview");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const expiresAt = bangkokLocalToIso(body.expiresAtLocal);
    if (!expiresAt) return apiError(400, "VALIDATION", "วัน/เวลาหมดอายุไม่ถูกต้อง");
    if (new Date(expiresAt).getTime() <= Date.now()) return apiError(400, "VALIDATION", "วัน/เวลาหมดอายุต้องเป็นอนาคต");

    const typed = body.code ? normalizeVoucherCode(body.code) : "";
    if (typed && !isValidVoucherCode(typed)) return apiError(400, "VALIDATION", "โค้ดใช้ได้เฉพาะ A-Z 0-9 และ - ยาว 4–24 ตัว");

    const admin = createAdminClient();
    for (let attempt = 0; attempt < (typed ? 1 : 5); attempt++) {
      const code = typed || generateVoucherCode((n) => randomInt(n));
      const { data, error } = await admin
        .from("voucher_codes")
        .insert({ code, coins: body.coins, max_redemptions: body.maxRedemptions, expires_at: expiresAt, note: body.note || null, created_by: user.email ?? user.id })
        .select("id, code")
        .single();
      if (!error) return NextResponse.json(data);
      if (error.code === "23505") {
        if (typed) return apiError(409, "VOUCHER_CODE_EXISTS", "มีโค้ดนี้อยู่แล้ว ใช้ชื่ออื่นนะคะ");
        continue; // a generated code collided: try another
      }
      if (error.code === "42P01" || error.code === "PGRST205") return apiError(503, "DB_MIGRATION_MISSING", "ยังไม่ได้รัน migration 0019 (ตารางโค้ดลับ)");
      throw new Error(error.message);
    }
    return apiError(500, "INTERNAL", "สร้างโค้ดไม่สำเร็จ ลองใหม่อีกครั้ง");
  } catch (e) {
    console.error("admin voucher create failed", e);
    await alertAdminError({ where: "POST /api/admin/vouchers (สร้างโค้ดลับ)", error: e, extra: ctx.admin ? `แอดมิน (admin id): ${ctx.admin}` : undefined });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
