import { NextResponse } from "next/server";
import { z } from "zod";
import { alertAdminError, shouldAlertRpcError } from "@/lib/admin-alert";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { toRoundView, type MysticRoundView } from "@/lib/mystic/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ roundId: z.string().uuid() });

/** Cash out. The amount is computed by `mystic_cashout` from the stored round (never from the request) and paid exactly once. */
export async function POST(request: Request) {
  const ctx: { userId?: string } = {};
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    ctx.userId = user.id;
    const limited = rateLimitResponse(user.id, "mysticCashout");
    if (limited) return limited;
    const { data: body, response: bad } = await parseJsonBody(request, Body);
    if (!body) return bad;

    const { data, error } = await createAdminClient().rpc("mystic_cashout", { p_user_id: user.id, p_round_id: body.roundId });
    if (error) {
      if (shouldAlertRpcError(error)) await alertAdminError({ where: "mystic_cashout (จ่ายเหรียญตอนกดรับ)", userId: user.id, error });
      return rpcErrorResponse(error);
    }
    return NextResponse.json<MysticRoundView>(toRoundView(data as Parameters<typeof toRoundView>[0]));
  } catch (e) {
    console.error("mystic cashout: unhandled exception", e);
    await alertAdminError({ where: "POST /api/mystic/cashout (exception)", userId: ctx.userId, error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง (หากรอบเพิ่งจบ ตรวจยอดเหรียญอีกครั้ง)");
  }
}
