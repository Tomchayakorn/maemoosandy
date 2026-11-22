import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { notifyAdminLine } from "@/lib/line-notify";
import {
  GUARANTEE_DRY_COINS,
  GUARANTEE_DRY_ROUNDS,
  GUARANTEE_EVERY_COINS,
  GUARANTEE_EVERY_ROUNDS,
  LUCKY_CARD_COST,
  LUCKY_CARD_COUNT,
  SECRET_PRIZE_THB,
} from "@/lib/lucky-card-config";
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
  // The two-step guarantee is applied by the database under the wallet lock (migration 0015). If 0015 isn't installed yet the
  // function with these parameters doesn't exist (PGRST202): fall back to the previous behaviour (no guarantee countdown) so the game keeps working.
  let { data, error } = await admin.rpc("play_lucky_card", {
    ...base,
    p_g1_after: GUARANTEE_DRY_ROUNDS,
    p_g1_coins: GUARANTEE_DRY_COINS,
    p_g2_every: GUARANTEE_EVERY_ROUNDS,
    p_g2_coins: GUARANTEE_EVERY_COINS,
  });
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
    guarantee_tier?: "dry" | "every" | null;
    dry_rounds?: number;
    cycle_rounds?: number;
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
        ? { kind: "bonus", coins: r.bonus_coins || (drawn.kind === "bonus" ? drawn.coins : GUARANTEE_DRY_COINS), guaranteed: r.guaranteed ? (r.guarantee_tier ?? "dry") : false }
        : { kind: "secret", prizeId: r.prize_id ?? "", amountThb: SECRET_PRIZE_THB };

  return NextResponse.json<LuckyCardPlayResponse>({ outcome: result, balance: r.balance, bonusTotal: r.bonus_total ?? null,
    cost: LUCKY_CARD_COST,
    guarantee: typeof r.dry_rounds === "number" && typeof r.cycle_rounds === "number" ? { dryRounds: r.dry_rounds, cycleRounds: r.cycle_rounds } : null,
  });
}
