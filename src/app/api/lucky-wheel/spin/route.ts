import { NextResponse } from "next/server";
import { apiError, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { WHEEL_SPIN_COST } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { JACKPOT_EVERY_PAID_SPINS, JACKPOT_SEGMENT_INDEX, pickStandardReward } from "@/lib/wheel/rewards";
import { spinDirect } from "@/lib/wheel/spin-direct";
import { WHEEL_SEGMENTS, type SpinResponse } from "@/lib/wheel/segments";

/** When the RPC is missing (migration 0004 not run) we use the no-migration path; re-probe the RPC every minute. */
let rpcRetryAt = 0;

/**
 * Spin once (free ticket, else 99 coins). The body is ignored: user, odds, price and reward are all server-side.
 *
 * We pre-draw an ORDINARY reward (jackpot excluded). The atomic RPC `spin_wheel_cycle` (migration 0004), or if it is not installed the
 * no-migration fallback in spin-direct.ts, decides
 * free vs paid under the wallet lock, counts paid spins in the database, and on every 200th PAID spin swaps in
 * the 5,000-coin jackpot. Free-ticket spins never count and can never win it. The counter is never sent to the client.
 */
export async function POST() {
  try {
    return await spin();
  } catch (e) {
    // Never let an exception escape as a non-JSON 500: the client would show "connection failed".
    console.error("lucky-wheel spin: unhandled exception", e);
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง (ยังไม่มีการหักเหรียญซ้ำ)");
  }
}

async function spin() {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "wheelSpin");
  if (limited) return limited;

  const standard = pickStandardReward();
  const jackpot = WHEEL_SEGMENTS[JACKPOT_SEGMENT_INDEX];

  const admin = createAdminClient();
  let row: { paid: boolean; jackpot: boolean; balance: number; spinTickets: number; freeReadingTickets: number } | null = null;

  if (Date.now() >= rpcRetryAt) {
    const { data, error } = await admin.rpc("spin_wheel_cycle", {
      p_user_id: user.id,
      p_cost: WHEEL_SPIN_COST,
      p_jackpot_every: JACKPOT_EVERY_PAID_SPINS,
      p_reward_key: standard.segment.key,
      p_reward_type: standard.segment.type,
      p_reward_value: standard.segment.value,
      p_jackpot_key: jackpot.key,
      p_jackpot_type: jackpot.type,
      p_jackpot_value: jackpot.value,
    });
    if (!error) {
      const r = data as { paid: boolean; jackpot: boolean; balance: number; spin_tickets: number; free_reading_tickets: number };
      if (r.jackpot && (data as { jackpot_withdrawals_available?: number }).jackpot_withdrawals_available === undefined) {
        // migration 0005 not installed: the jackpot was paid but no withdrawal quota was granted
        console.error("lucky-wheel: JACKPOT WON without withdrawal quota (run migration 0005)", { userId: user.id });
      }
      row = { paid: r.paid, jackpot: r.jackpot, balance: r.balance, spinTickets: r.spin_tickets, freeReadingTickets: r.free_reading_tickets };
    } else if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") {
      rpcRetryAt = Date.now() + 60_000; // migration 0004 not installed: use the fallback, never fail the spin
    } else {
      return rpcErrorResponse(error);
    }
  }

  if (!row) {
    const direct = await spinDirect(admin, user.id, standard.segment, jackpot, WHEEL_SPIN_COST, JACKPOT_EVERY_PAID_SPINS);
    if (direct.error) return rpcErrorResponse(direct.error);
    row = direct.data;
  }

  const segmentIndex = row.jackpot ? JACKPOT_SEGMENT_INDEX : standard.segmentIndex;
  const segment = WHEEL_SEGMENTS[segmentIndex];

  return NextResponse.json<SpinResponse>({
    segmentIndex,
    reward: { key: segment.key, type: segment.type, value: segment.value, label: segment.label },
    balance: row.balance,
    spinTickets: row.spinTickets,
    freeReadingTickets: row.freeReadingTickets,
    paid: row.paid,
    cost: row.paid ? WHEEL_SPIN_COST : 0,
  });
}
