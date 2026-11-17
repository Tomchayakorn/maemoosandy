import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { listLocalRequests, reviewLocalRequest } from "@/lib/withdrawals-local";

const Body = z.object({ action: z.enum(["approve", "reject"]) });
const Id = z.string().uuid();

/** Admin only: approve (money sent) or reject (refund 5,000 coins + 1 quota) a pending withdrawal. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
  const limited = rateLimitResponse(user.id, "adminReview");
  if (limited) return limited;

  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return apiError(400, "VALIDATION", "รหัสคำขอไม่ถูกต้อง");
  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;

  const admin = createAdminClient();
  if ((await listLocalRequests()).some((x) => x.id === id.data)) {
    const out = await reviewLocalRequest(admin, id.data, body.action === "approve", user.email ?? user.id);
    if ("error" in out) {
      if (out.error === "WITHDRAWAL_NOT_FOUND") return apiError(404, out.error, "ไม่พบคำขอถอน");
      if (out.error === "WITHDRAWAL_ALREADY_REVIEWED") return apiError(409, out.error, "คำขอนี้ถูกดำเนินการไปแล้ว");
      return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
    }
    return NextResponse.json(out);
  }
  const { data, error } = await admin.rpc("review_jackpot_withdrawal", {
    p_request_id: id.data,
    p_approve: body.action === "approve",
    p_reviewer: user.email ?? user.id,
  });
  if (error) return rpcErrorResponse(error);
  return NextResponse.json(data);
}
