import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { notifyAdminLine } from "@/lib/line-notify";
import { LUCKY_CARD_COST, LUCKY_CARD_COUNT, PITY_AFTER_DRY_ROUNDS, PITY_BONUS_COINS, SECRET_PRIZE_THB } from "@/lib/lucky-card-config";
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

  const drawn = drawOutcome();
  const admin = createAdminClient();
  const base = {
    p_user_id: user.id,
    p_cost: LUCKY_CARD_COST,
    p_card_index: body.cardIndex,
    p_kind: drawn.kind,
    p_message_id: drawn.kind === "message" ? drawn.messageId : null,
    p_bonus_coins: drawn.kind === "bonus" ? drawn.coins : 0,
    p_prize_thb: drawn.kind === "secret" ? SECRET_PRIZE_THB : 0,
  };
  // The bonus guarantee is applied by the database under the wallet lock (migration 0008). If 0008 isn't installed yet the
  // function with these parameters doesn't exist (PGRST202): fall back to the previous behaviour (no guarantee) so the game keeps working.
  let { data, error } = await admin.rpc("play_lucky_card", { ...base, p_pity_after: PITY_AFTER_DRY_ROUNDS, p_pity_bonus: PITY_BONUS_COINS });
  if (error && error.code === "PGRST202") ({ data, error } = await admin.rpc("play_lucky_card", base));
  if (error) return rpcErrorResponse(error);

  const r = data as {
    play_id: string;
    balance: number;
    prize_id: string | null;
    bonus_total?: number;
    kind?: "message" | "bonus" | "secret";
    bonus_coins?: number;
    message_id?: string | null;
    guaranteed?: boolean;
  };
  // What was actually applied (the guarantee may have turned a message into a bonus); older RPC = what we drew.
  const kind = r.kind ?? drawn.kind;
  if (kind === "secret") {
    await notifyAdminLine(`🎴 ดวงดี มีเฮ: ผู้ใช้ ${user.email ?? user.id} ได้รางวัลลับ "เทพประทานทรัพย์" ${SECRET_PRIZE_THB.toLocaleString("th-TH")} บาท`);
  }

  const result: LuckyCardPlayResponse["outcome"] =
    kind === "message"
      ? { kind: "message", messageId: r.message_id ?? (drawn.kind === "message" ? drawn.messageId : "") }
      : kind === "bonus"
        ? { kind: "bonus", coins: (r.bonus_coins || (drawn.kind === "bonus" ? drawn.coins : PITY_BONUS_COINS)) as 100 | 300 | 500, guaranteed: !!r.guaranteed }
        : { kind: "secret", prizeId: r.prize_id ?? "", amountThb: SECRET_PRIZE_THB };

  return NextResponse.json<LuckyCardPlayResponse>({ outcome: result, balance: r.balance, bonusTotal: r.bonus_total ?? null, cost: LUCKY_CARD_COST });
}
