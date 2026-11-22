import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { alertAdminError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ active: z.boolean() });
const Id = z.string().uuid();

/** Admin only: switch a voucher code on / off (redemptions already made are untouched). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
    const limited = rateLimitResponse(user.id, "adminReview");
    if (limited) return limited;
    const id = Id.safeParse((await ctx.params).id);
    if (!id.success) return apiError(400, "VALIDATION", "รหัสโค้ดไม่ถูกต้อง");
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const { data, error } = await createAdminClient().from("voucher_codes").update({ is_active: body.active }).eq("id", id.data).select("id, is_active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return apiError(404, "VOUCHER_NOT_FOUND", "ไม่พบโค้ดนี้");
    return NextResponse.json(data);
  } catch (e) {
    console.error("admin voucher toggle failed", e);
    await alertAdminError({ where: "POST /api/admin/vouchers/[id] (เปิด-ปิดโค้ดลับ)", error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
