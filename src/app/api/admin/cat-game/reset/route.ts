import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
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
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
  const limited = rateLimitResponse(user.id, "adminReview");
  if (limited) return limited;
  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;

  const { data, error } = await createAdminClient().rpc("admin_reset_cat_game", {
    p_user_id: body.userId,
    p_admin: user.email ?? user.id,
    p_reason: body.reason || null,
  });
  if (error) return rpcErrorResponse(error);
  return NextResponse.json(data);
}
