import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { BETS } from "@/lib/power-wheel/config";
import { toRoundView, type PowerRoundView } from "@/lib/power-wheel/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ bet: z.number().int().refine((b) => (BETS as readonly number[]).includes(b), "เดิมพันไม่ถูกต้อง") });

/**
 * Start a round of วงล้อไต่ชั้น. The client sends only the bet; `power_start_bonus_v3` (migration 0024, else the 0023 / 0021 function) charges
 * it and creates the round in one transaction.
 */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "powerStart");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const admin = createAdminClient();
    const args = { p_user_id: user.id, p_bet: body.bet };
    let { data, error } = await admin.rpc("power_start_bonus_v3", args);
    // migration 0024 / 0023 not installed yet: a round under the rules the database does have
    if (error?.code === "PGRST202") ({ data, error } = await admin.rpc("power_start_bonus", args));
    if (error?.code === "PGRST202") ({ data, error } = await admin.rpc("power_start", args));
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "power_start (หักเดิมพัน/เริ่มรอบ)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<PowerRoundView>(toRoundView(data as Parameters<typeof toRoundView>[0]));
  } catch (e) {
    console.error("power-wheel start: unhandled exception", e);
    await alertAdminError({ where: "POST /api/power-wheel/start (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
