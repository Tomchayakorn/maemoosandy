import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { drawBonusRoll, drawSlice } from "@/lib/power-wheel/draw";
import { toRoundView, type PowerRoundView } from "@/lib/power-wheel/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ roundId: z.string().uuid() });

/**
 * Spin once on the next level. The client sends only the round id. The slice and the bonus roll are drawn here with crypto; the database
 * decides from the round whether the slice is a danger slice, whether this spin unlocks the bonus and which multiplier the roll gives
 * (`power_spin_bonus`), so neither the outcome, the multiplier nor the payout can come from the request.
 */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "powerSpin");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const admin = createAdminClient();
    const args = { p_user_id: user.id, p_round_id: body.roundId, p_slice: drawSlice() };
    let { data, error } = await admin.rpc("power_spin_bonus", { ...args, p_roll: drawBonusRoll() });
    // migration 0023 not installed yet: the original function
    if (error?.code === "PGRST202") ({ data, error } = await admin.rpc("power_spin", args));
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "power_spin (หมุนวงล้อไต่ชั้น)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<PowerRoundView>(toRoundView(data as Parameters<typeof toRoundView>[0]));
  } catch (e) {
    console.error("power-wheel spin: unhandled exception", e);
    await alertAdminError({ where: "POST /api/power-wheel/spin (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
