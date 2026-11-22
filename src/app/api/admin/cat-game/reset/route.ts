import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  userId: z.string().uuid("รหัสผู้ใช้ไม่ถูกต้อง"),
  reason: z.string().trim().max(200, "เหตุผลยาวเกินไป").optional(),
});

/**
 * Admin only: give a player their "น้องเหมียว 9 ชีวิต" daily chance back (removes TODAY's play row, audited).
 * Coins and ledger are not touched; the player pays 9 and wins a fresh reward if they play again. RPC: admin_reset_cat_game (0017).
 */
export async function POST(request: Request) {
  const ctx: { target?: string; admin?: string } = {};
  try {
    return await reset(request, ctx);
  } catch (e) {
    console.error("admin cat-game reset: unhandled exception", e);
    await alertAdminError({ where: "POST /api/admin/cat-game/reset (exception)", userId: ctx.target, error: e, extra: ctx.admin ? `ผู้กดรีเซ็ต (admin id): ${ctx.admin}` : undefined });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}

async function reset(request: Request, ctx: { target?: string; admin?: string }) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
  const limited = rateLimitResponse(user.id, "adminReview");
  if (limited) return limited;
  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;
  ctx.target = body.userId;
  ctx.admin = user.id;

  const { data, error } = await createAdminClient().rpc("admin_reset_cat_game", {
    p_user_id: body.userId,
    p_admin: user.email ?? user.id,
    p_reason: body.reason || null,
  });
  if (error) {
    if (shouldAlertRpcError(error)) {
      await alertAdminError({ where: "admin_reset_cat_game (คืนสิทธิ์เล่นรายวัน)", userId: body.userId, error, extra: `ผู้กดรีเซ็ต (admin id): ${user.id}` });
    }
    return rpcErrorResponse(error);
  }
  return NextResponse.json(data);
}
