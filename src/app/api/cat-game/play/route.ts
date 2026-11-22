import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { bangkokDate, CAT_COUNT, CAT_GAME_COST, nextPlayAt } from "@/lib/cat-game/config";
import { drawCatReward } from "@/lib/cat-game/draw";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ catIndex: z.number().int().min(0).max(CAT_COUNT - 1) });

export type CatGamePlayResponse = { reward: number; balance: number; cost: number; playDate: string; nextPlayAt: string };

/**
 * Play "น้องเหมียว 9 ชีวิต" (9 coins, once per Bangkok day). Only the cat index comes from the client; user, price and reward are
 * server-side. The RPC `play_cat_game` (migration 0016) enforces the daily limit under the wallet lock, charges 9, credits the reward
 * and logs everything in ONE transaction, so a double click / second tab can never play twice and a failure never moves coins.
 */
export async function POST(request: Request) {
  try {
    return await play(request);
  } catch (e) {
    console.error("cat-game play: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง (ยังไม่มีการหักเหรียญ)");
  }
}

async function play(request: Request) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "catGamePlay");
  if (limited) return limited;

  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;

  const reward = drawCatReward();
  const { data, error } = await createAdminClient().rpc("play_cat_game", {
    p_user_id: user.id,
    p_cost: CAT_GAME_COST,
    p_cat_index: body.catIndex,
    p_reward: reward,
  });
  if (error) return rpcErrorResponse(error);

  const r = data as { balance: number; reward_coins: number; play_date?: string };
  const now = new Date();
  return NextResponse.json<CatGamePlayResponse>({
    reward: r.reward_coins,
    balance: r.balance,
    cost: CAT_GAME_COST,
    playDate: r.play_date ?? bangkokDate(now),
    nextPlayAt: nextPlayAt(now).toISOString(),
  });
}
