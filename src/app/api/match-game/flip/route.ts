import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { CARDS, MAX_TURNS } from "@/lib/match-game/config";
import { toMatchView, type MatchRoundView } from "@/lib/match-game/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  roundId: z.string().uuid(),
  position: z.number().int().min(0).max(CARDS - 1),
  step: z.number().int().min(0).max(MAX_TURNS * 2),
});

/**
 * Turn one card. The client names only the round, the card and the step it saw; what is on the card, whether it matches and any coins are
 * decided by `match_flip` in the database.
 */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "matchFlip");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const { data, error } = await createAdminClient().rpc("match_flip", { p_user_id: user.id, p_round_id: body.roundId, p_position: body.position, p_step: body.step });
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "match_flip (เปิดไพ่จับคู่)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<MatchRoundView>(toMatchView(data as Parameters<typeof toMatchView>[0]));
  } catch (e) {
    console.error("match-game flip: unhandled exception", e);
    await alertAdminError({ where: "POST /api/match-game/flip (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
