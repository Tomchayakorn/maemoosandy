import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { WHEEL_SPIN_COST } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { JACKPOT_EVERY_PAID_SPINS, JACKPOT_SEGMENT_INDEX, pickStandardReward } from "@/lib/wheel/rewards";
import { WHEEL_CASH_PCT, cashCredit } from "@/lib/wheel/cash";
import { HOT_STREAK_ROUNDS, HOT_TRIGGER_ONE_IN } from "@/lib/wheel/hot-streak";
import { addWheelCash, applyHotAfterSpin, applyLuckAfterSpin, readHot, readLuck } from "@/lib/wheel/luck-direct";
import { spinDirect } from "@/lib/wheel/spin-direct";
import { WHEEL_SEGMENTS, type SpinResponse, type WheelSegment } from "@/lib/wheel/segments";

/** When the RPC is missing (migration 0004 not run) we use the no-migration path; re-probe the RPC every minute. */
let rpcRetryAt = 0;

/**
 * Spin once (free ticket, else WHEEL_SPIN_COST coins). The body is ignored: user, odds, price and reward are all server-side.
 *
 * We pre-draw an ORDINARY reward (jackpot excluded). The atomic RPC `spin_wheel_cycle` (migration 0004), or if it is not installed the
 * no-migration fallback in spin-direct.ts, decides
 * free vs paid under the wallet lock, counts paid spins in the database, and on every JACKPOT_EVERY_PAID_SPINS-th PAID spin swaps in
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

const RETRY = WHEEL_SEGMENTS.find((s) => s.key === "retry_a")!;
const isMissingFn = (e: { code?: string }) => e.code === "PGRST202" || e.code === "42883" || e.code === "42P01";
/** Before migration 0010 the database does not know the 'luck_card' reward type: such a draw becomes "retry" instead of failing. */
const legacySafe = (seg: WheelSegment): WheelSegment => (seg.type === "luck_card" ? RETRY : seg);
/** Signatures tried in order: 18 args (0014: hot streak) → 13 (0013: cash tally) → 12 (0010/0012: luck cards) → 9 (legacy). A missing one is skipped for a minute. */
const SIGNATURES = [{ cash: true, hot: true }, { cash: true, hot: false }, { cash: false, hot: false }] as const;
const sigMissingUntil = [0, 0, 0];

type Row = {
  paid: boolean;
  jackpot: boolean;
  balance: number;
  spinTickets: number;
  freeReadingTickets: number;
  rewardKey?: string;
  luckCards?: number;
  luckBuffRounds?: number;
  buffApplied?: boolean;
  wheelCashTotal?: number;
  hotStreakRounds?: number;
  hotApplied?: boolean;
  hotStarted?: boolean;
};

async function spin() {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "wheelSpin");
  if (limited) return limited;

  // Two ordinary draws (crypto): normal odds and luck-card-buffed odds. The database decides under the wallet lock which one
  // applies (the buff is stored per player), so the client can never choose and two tabs can't both use the same buff round.
  const standard = pickStandardReward();
  const drawnBuffed = pickStandardReward({ buffed: true });
  // Buff rule: a buffed spin never ends as "retry" (buffedWeights has no retry; the database refuses one too). Belt and braces:
  const buffedSegment: WheelSegment =
    drawnBuffed.segment.type === "none" ? WHEEL_SEGMENTS.find((s) => s.key === "coins_20")! : drawnBuffed.segment;
  // Hot streak ("มือขึ้น 5 ตาติด"): a third draw from the hot odds + the crypto roll that may START a streak after this paid spin.
  // The database applies both under the wallet lock (a running streak uses the hot draw; a new one starts only on a paid spin outside a streak).
  const hotSegment = pickStandardReward({ hot: true }).segment;
  const hotTrigger = randomInt(HOT_TRIGGER_ONE_IN) === 0;
  const jackpot = WHEEL_SEGMENTS[JACKPOT_SEGMENT_INDEX];

  const admin = createAdminClient();
  let row: Row | null = null;
  let usedStandard: WheelSegment = standard.segment;

  const call = (std: WheelSegment, buff?: WheelSegment, cash = false, hot = false) =>
    admin.rpc("spin_wheel_cycle", {
      p_user_id: user.id,
      p_cost: WHEEL_SPIN_COST,
      p_jackpot_every: JACKPOT_EVERY_PAID_SPINS,
      p_reward_key: std.key,
      p_reward_type: std.type,
      p_reward_value: std.value,
      p_jackpot_key: jackpot.key,
      p_jackpot_type: jackpot.type,
      p_jackpot_value: jackpot.value,
      ...(buff ? { p_buff_reward_key: buff.key, p_buff_reward_type: buff.type, p_buff_reward_value: buff.value } : {}),
      ...(cash ? { p_cash_pct: WHEEL_CASH_PCT } : {}),
      ...(hot
        ? {
            p_hot_trigger: hotTrigger,
            p_hot_reward_key: hotSegment.key,
            p_hot_reward_type: hotSegment.type,
            p_hot_reward_value: hotSegment.value,
            p_hot_rounds: HOT_STREAK_ROUNDS,
          }
        : {}),
    });

  if (Date.now() >= rpcRetryAt) {
    let res: Awaited<ReturnType<typeof call>> | null = null;
    for (const [i, sig] of SIGNATURES.entries()) {
      if (Date.now() < sigMissingUntil[i]) continue;
      const attempt = await call(standard.segment, buffedSegment, sig.cash, sig.hot);
      if (attempt.error && isMissingFn(attempt.error)) {
        sigMissingUntil[i] = Date.now() + 60_000; // that migration isn't installed: try the next older signature
        console.error("lucky-wheel: spin_wheel_cycle signature unavailable", { ...sig, code: attempt.error.code, message: attempt.error.message });
        continue;
      }
      res = attempt;
      break;
    }
    if (!res) {
      usedStandard = legacySafe(standard.segment);
      res = await call(usedStandard);
    }
    const { data, error } = res;
    if (!error) {
      const r = data as {
        paid: boolean;
        jackpot: boolean;
        balance: number;
        spin_tickets: number;
        free_reading_tickets: number;
        reward_key?: string;
        luck_cards?: number;
        luck_buff_rounds?: number;
        buff_applied?: boolean;
        wheel_cash_total?: number;
        hot_streak_rounds?: number;
        hot_applied?: boolean;
        hot_started?: boolean;
      };
      if (r.jackpot && (data as { jackpot_withdrawals_available?: number }).jackpot_withdrawals_available === undefined) {
        // migration 0005 not installed: the jackpot was paid but no withdrawal quota was granted
        console.error("lucky-wheel: JACKPOT WON without withdrawal quota (run migration 0005)", { userId: user.id });
      }
      row = {
        paid: r.paid,
        jackpot: r.jackpot,
        balance: r.balance,
        spinTickets: r.spin_tickets,
        freeReadingTickets: r.free_reading_tickets,
        rewardKey: r.reward_key,
        luckCards: r.luck_cards,
        luckBuffRounds: r.luck_buff_rounds,
        buffApplied: r.buff_applied,
        wheelCashTotal: r.wheel_cash_total,
        hotStreakRounds: r.hot_streak_rounds,
        hotApplied: r.hot_applied,
        hotStarted: r.hot_started,
      };
    } else if (isMissingFn(error)) {
      // NOT silent: this path knows nothing about wheel_state/luck cards. 42P01 = a table the RPC needs is missing (run migration 0011).
      console.error("lucky-wheel: spin_wheel_cycle unavailable, using the no-RPC fallback", { code: error.code, message: error.message });
      rpcRetryAt = Date.now() + 60_000; // use the fallback, never fail the spin
    } else {
      return rpcErrorResponse(error);
    }
  }

  if (!row) {
    // No-RPC fallback. It must still honour the luck-card buff, otherwise luck_buff_rounds never counts down.
    const luck = await readLuck(admin, user.id); // null = luck columns don't exist (migration 0010 missing)
    const buffActive = (luck?.buff ?? 0) > 0;
    const hot = await readHot(admin, user.id); // null = hot column doesn't exist (migration 0014 missing)
    const hotActive = (hot ?? 0) > 0;
    // reward precedence (as in SQL): luck-card buff > hot streak > ordinary (the jackpot is decided inside spinDirect)
    usedStandard = luck === null ? legacySafe(standard.segment) : buffActive ? buffedSegment : hotActive ? hotSegment : standard.segment;
    const direct = await spinDirect(admin, user.id, usedStandard, jackpot, WHEEL_SPIN_COST, JACKPOT_EVERY_PAID_SPINS);
    if (direct.error) return rpcErrorResponse(direct.error);
    row = direct.data;
    if (luck !== null) {
      const after = await applyLuckAfterSpin(admin, user.id, !row.jackpot && usedStandard.type === "luck_card");
      if (after) row = { ...row, luckCards: after.cards, luckBuffRounds: after.buff };
      row = { ...row, buffApplied: buffActive };
      // cash tally (paid, non-jackpot coin prizes only) — same rule as the SQL; null if migration 0013 isn't installed
      const credit = row.paid && !row.jackpot && usedStandard.type === "coins" ? cashCredit(usedStandard.value) : 0;
      const tally = await addWheelCash(admin, user.id, credit);
      if (tally !== null) row = { ...row, wheelCashTotal: tally };
    }
    if (hot !== null) {
      const h = await applyHotAfterSpin(admin, user.id, { paid: row.paid, trigger: hotTrigger });
      if (h) row = { ...row, hotStreakRounds: h.rounds, hotApplied: h.applied && !buffActive && !row.jackpot, hotStarted: h.started };
    }
  }

  // Which segment really won: the jackpot, else the reward the database applied (it may be the buffed draw), else the ordinary draw.
  const appliedIndex = row.rewardKey ? WHEEL_SEGMENTS.findIndex((s) => s.key === row.rewardKey) : -1;
  const segmentIndex = row.jackpot
    ? JACKPOT_SEGMENT_INDEX
    : appliedIndex >= 0
      ? appliedIndex
      : WHEEL_SEGMENTS.findIndex((s) => s.key === usedStandard.key);
  const segment = WHEEL_SEGMENTS[segmentIndex];

  return NextResponse.json<SpinResponse>({
    segmentIndex,
    reward: { key: segment.key, type: segment.type, value: segment.value, label: segment.label },
    balance: row.balance,
    spinTickets: row.spinTickets,
    freeReadingTickets: row.freeReadingTickets,
    luckCards: row.luckCards,
    luckBuffRounds: row.luckBuffRounds,
    buffApplied: row.buffApplied,
    wheelCashTotal: row.wheelCashTotal,
    hotStreakRounds: row.hotStreakRounds,
    hotApplied: row.hotApplied,
    hotStarted: row.hotStarted,
    paid: row.paid,
    cost: row.paid ? WHEEL_SPIN_COST : 0,
  });
}
