import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { BETS } from "@/lib/mystic/config";
import { drawMineMask } from "@/lib/mystic/draw";
import { toRoundView, type MysticRoundView } from "@/lib/mystic/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  bet: z.number().int().refine((b) => (BETS as readonly number[]).includes(b), "เดิมพันไม่ถูกต้อง"),
  mines: z.number().int().min(1).max(3),
});

/**
 * Start a round of เปิดหีบมนตรา. The client sends only the bet and the number of cursed chests; the user is the verified session and the
 * cursed positions are drawn here with crypto. `mystic_start_bonus` (migration 0025, else `mystic_start` of 0020) charges the bet and creates
 * the round in one transaction.
 */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "mysticStart");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const admin = createAdminClient();
    const args = { p_user_id: user.id, p_bet: body.bet, p_mines: body.mines, p_mine_mask: drawMineMask(body.mines) };
    let { data, error } = await admin.rpc("mystic_start_bonus", args);
    // migration 0025 not installed yet: a round under the original rules
    if (error?.code === "PGRST202") ({ data, error } = await admin.rpc("mystic_start", args));
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "mystic_start (หักเดิมพัน/เริ่มรอบ)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<MysticRoundView>(toRoundView(data as Parameters<typeof toRoundView>[0]));
  } catch (e) {
    console.error("mystic start: unhandled exception", e);
    await alertAdminError({ where: "POST /api/mystic/start (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
