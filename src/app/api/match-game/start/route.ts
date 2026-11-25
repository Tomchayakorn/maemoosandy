import { NextResponse } from "next/server";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { dealLayout } from "@/lib/match-game/deal";
import { toMatchView, type MatchRoundView } from "@/lib/match-game/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Start a round of จับคู่ภาพเหมือน. Nothing is read from the request body: the layout is shuffled here and `match_start` (migration 0022)
 * checks the daily limit, charges the round and stores it in one transaction.
 */
export async function POST() {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "matchStart");
    if (limited) return limited;

    const { data, error } = await createAdminClient().rpc("match_start", { p_user_id: user.id, p_layout: dealLayout() });
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "match_start (เริ่มรอบจับคู่)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<MatchRoundView>(toMatchView(data as Parameters<typeof toMatchView>[0]));
  } catch (e) {
    console.error("match-game start: unhandled exception", e);
    await alertAdminError({ where: "POST /api/match-game/start (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
