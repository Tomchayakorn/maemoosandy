import { NextResponse } from "next/server";
import { apiError, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { WHEEL_SPIN_COST } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUFF_ROUNDS } from "@/lib/wheel/luck-card";
import { parseRpcError } from "@/types/database";

export type UseLuckCardResponse = { luckCards: number; luckBuffRounds: number };

/**
 * Use one "การ์ด +ความเฮง": starts the buff for the next BUFF_ROUNDS spins. The body is ignored — user, card count, length and the
 * minimum balance come from the session/database/server constants. The RPC locks the wallet and refuses
 *  - a second use while a buff is running (BUFF_ALREADY_ACTIVE) and a use with no card (NO_LUCK_CARDS), so double clicks and second
 *    tabs can't waste or stack cards;
 *  - a use when the player cannot spin right now (no free ticket and fewer than WHEEL_SPIN_COST coins → INSUFFICIENT_COINS),
 *    so a buff is never started that could not be used. The card stays in the inventory.
 */
export async function POST() {
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    const limited = rateLimitResponse(user.id, "wheelUseCard");
    if (limited) return limited;

    const admin = createAdminClient();
    let { data, error } = await admin.rpc("use_luck_card", { p_user_id: user.id, p_rounds: BUFF_ROUNDS, p_min_balance: WHEEL_SPIN_COST });
    // an earlier version of migration 0010 had no p_min_balance: fall back to it (the UI still blocks the click)
    if (error && (error.code === "PGRST202" || error.code === "42883")) {
      ({ data, error } = await admin.rpc("use_luck_card", { p_user_id: user.id, p_rounds: BUFF_ROUNDS }));
    }
    if (error) {
      if (parseRpcError(error.message) === "INSUFFICIENT_COINS") {
        return apiError(
          402,
          "INSUFFICIENT_COINS",
          `เหรียญไม่พอสำหรับหมุน (ต้องมีอย่างน้อย ${WHEEL_SPIN_COST} เหรียญ หรือมีสิทธิ์หมุนฟรี) เติมเหรียญก่อนแล้วค่อยใช้การ์ดนะคะ การ์ดยังอยู่ในคลังของคุณ`,
        );
      }
      return rpcErrorResponse(error);
    }
    const r = data as { luck_cards: number; luck_buff_rounds: number };
    return NextResponse.json<UseLuckCardResponse>({ luckCards: r.luck_cards, luckBuffRounds: r.luck_buff_rounds });
  } catch (e) {
    console.error("lucky-wheel use-card: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
