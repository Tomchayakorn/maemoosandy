import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { notifyAdminLine } from "@/lib/line-notify";
import { LUCKY_CARD_COST, LUCKY_CARD_COUNT, SECRET_PRIZE_THB } from "@/lib/lucky-card-config";
import { drawOutcome } from "@/lib/lucky-card/draw";
import type { LuckyCardPlayResponse } from "@/lib/lucky-card/types";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ cardIndex: z.number().int().min(0).max(LUCKY_CARD_COUNT - 1) });

/**
 * Play one round (20 coins). Only the card index comes from the client; user, price, odds and prize
 * are server-side. The RPC `play_lucky_card` (migration 0006) charges, credits the bonus, records the
 * prize entitlement and logs the play in ONE transaction, so a failure never leaves coins half-moved.
 */
export async function POST(request: Request) {
  try {
    return await play(request);
  } catch (e) {
    console.error("lucky-card play: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง (ยังไม่มีการหักเหรียญ)");
  }
}

async function play(request: Request) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "luckyCardPlay");
  if (limited) return limited;

  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;

  const outcome = drawOutcome();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("play_lucky_card", {
    p_user_id: user.id,
    p_cost: LUCKY_CARD_COST,
    p_card_index: body.cardIndex,
    p_kind: outcome.kind,
    p_message_id: outcome.kind === "message" ? outcome.messageId : null,
    p_bonus_coins: outcome.kind === "bonus" ? outcome.coins : 0,
    p_prize_thb: outcome.kind === "secret" ? SECRET_PRIZE_THB : 0,
  });
  if (error) return rpcErrorResponse(error);

  const r = data as { play_id: string; balance: number; prize_id: string | null };
  if (outcome.kind === "secret") {
    await notifyAdminLine(`🎴 ดวงดี มีเฮ: ผู้ใช้ ${user.email ?? user.id} ได้รางวัลลับ "เทพประทานทรัพย์" ${SECRET_PRIZE_THB.toLocaleString("th-TH")} บาท`);
  }

  const result: LuckyCardPlayResponse["outcome"] =
    outcome.kind === "message"
      ? { kind: "message", messageId: outcome.messageId }
      : outcome.kind === "bonus"
        ? { kind: "bonus", coins: outcome.coins }
        : { kind: "secret", prizeId: r.prize_id ?? "", amountThb: SECRET_PRIZE_THB };

  return NextResponse.json<LuckyCardPlayResponse>({ outcome: result, balance: r.balance, cost: LUCKY_CARD_COST });
}
