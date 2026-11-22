import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { TILES } from "@/lib/mystic/config";
import { toRoundView, type MysticRoundView } from "@/lib/mystic/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ roundId: z.string().uuid(), tile: z.number().int().min(0).max(TILES - 1) });

/** Open one chest. Everything (safe or cursed, multiplier, automatic payout at the cap / all chests) is decided by `mystic_open` in the database. */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "mysticOpen");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const { data, error } = await createAdminClient().rpc("mystic_open", { p_user_id: user.id, p_round_id: body.roundId, p_tile: body.tile });
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "mystic_open (เปิดหีบ)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<MysticRoundView>(toRoundView(data as Parameters<typeof toRoundView>[0]));
  } catch (e) {
    console.error("mystic open: unhandled exception", e);
    await alertAdminError({ where: "POST /api/mystic/open (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
