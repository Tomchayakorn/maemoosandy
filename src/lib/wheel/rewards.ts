import "server-only";
import { randomInt } from "node:crypto";
import { WHEEL_SPIN_COST } from "../pricing";
import { BUFF_MULTIPLIER, BUFF_ROUNDS } from "./luck-card";
import { WHEEL_SEGMENTS } from "./segments";

/**
 * Server-side odds for ORDINARY spins. One weight per WHEEL_SEGMENTS entry (same order), total 10,000 (= 100%).
 * The 5,000-coin jackpot segment has weight 0: it is never drawn randomly. It is only awarded by
 * the database on every JACKPOT_EVERY_PAID_SPINS-th PAID spin (RPC `spin_wheel_cycle`),
 * and never for a free-ticket spin.
 *
 *  retry 67.3% · 25 coins 23% · 50 coins 5.5% · "การ์ด +ความเฮง" 1.5% · 150 coins 1% · 500 coins 0.2% · free reading 1.5%
 *  (31.2% of spins win a coin prize or the free reading; 32.7% win something including the card)
 *
 * While the luck-card buff is active the 500-coin weight is multiplied by BUFF_MULTIPLIER (see buffedWeights): the extra weight is
 * taken from "retry" only, so the 25/50/150 chances stay exactly the same.
 *
 * With WHEEL_SPIN_COST = 50 and the jackpot every 1,000th paid spin, the long-run return is ≈ 17.5 coins per paid spin
 * ≈ 35% (owner keeps ≈ 65%); see expectedReturnPerPaidSpin(). The free reading ticket is valued at FREE_READING_VALUE_COINS and a
 * luck card at luckCardValueCoins().
 *
 * NEVER import this from client code — the client only gets segments.ts.
 */
export const SEGMENT_WEIGHTS: readonly number[] = [6730, 2300, 550, 150, 100, 20, 150, 0];

export const TOTAL_WEIGHT = SEGMENT_WEIGHTS.reduce((a, b) => a + b, 0);

const SEGMENT_INDEX = (key: string) => WHEEL_SEGMENTS.findIndex((s) => s.key === key);

/** Weights while the luck-card buff is active: 500-coin × BUFF_MULTIPLIER, the difference comes out of "retry". Total unchanged. */
export function buffedWeights(): readonly number[] {
  const w = [...SEGMENT_WEIGHTS];
  const i500 = SEGMENT_INDEX("coins_500");
  const iRetry = SEGMENT_INDEX("retry_a");
  const extra = Math.round(w[i500] * (BUFF_MULTIPLIER - 1));
  if (extra > w[iRetry]) throw new RangeError("not enough retry weight to fund the luck-card buff");
  w[i500] += extra;
  w[iRetry] -= extra;
  return w;
}

/**
 * Every Nth paid spin (global counter, free-ticket spins excluded) is the 5,000-coin jackpot.
 * 1,000 (was 200 at a 99-coin price, briefly 500): at a 50-coin price one jackpot per 200 paid spins would alone return 50% of
 * revenue; 1,000 costs only 10% of revenue and leaves the budget for the small prizes (25/50) to hit more often.
 * The SQL takes this as a parameter (p_jackpot_every), so changing it needs no migration.
 */
export const JACKPOT_EVERY_PAID_SPINS = 1000;

/** Nominal value of one free-reading ticket in coins (tarot price) — used ONLY for the return calculation below. */
export const FREE_READING_VALUE_COINS = 99;

export const JACKPOT_SEGMENT_INDEX = WHEEL_SEGMENTS.findIndex((s) => s.key === "jackpot_5000");

/** Which spin number (1-based, paid spins only) is a jackpot. Mirrors the SQL in migration 0004. */
export function isJackpotPaidSpin(paidSpinNumber: number, every = JACKPOT_EVERY_PAID_SPINS): boolean {
  return paidSpinNumber > 0 && paidSpinNumber % every === 0;
}

/**
 * Reference model of what `spin_wheel_cycle` decides (the database is the source of truth;
 * this keeps the rule unit-testable). A free spin never advances the counter and never wins the jackpot.
 */
export function resolveSpin(opts: { paid: boolean; paidSpinCountBefore: number; standardIndex: number }) {
  const paidSpinNumber = opts.paid ? opts.paidSpinCountBefore + 1 : null;
  const jackpot = paidSpinNumber !== null && isJackpotPaidSpin(paidSpinNumber);
  return {
    jackpot,
    segmentIndex: jackpot ? JACKPOT_SEGMENT_INDEX : opts.standardIndex,
    paidSpinCountAfter: opts.paidSpinCountBefore + (opts.paid ? 1 : 0),
  };
}

/** Map a roll in [0, TOTAL_WEIGHT) to a segment index. Pure, for testing. */
export function segmentForRoll(roll: number, weights: readonly number[] = SEGMENT_WEIGHTS): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (roll < acc) return i;
  }
  throw new RangeError(`roll ${roll} out of range`);
}

/** Cryptographically random weighted pick of an ORDINARY reward (never the jackpot). `buffed` = luck-card odds. */
export function pickStandardReward(opts: { buffed?: boolean } = {}) {
  const segmentIndex = segmentForRoll(randomInt(TOTAL_WEIGHT), opts.buffed ? buffedWeights() : SEGMENT_WEIGHTS);
  return { segmentIndex, segment: WHEEL_SEGMENTS[segmentIndex] };
}

/**
 * Average value of ONE luck card in coins: BUFF_ROUNDS spins with the 500-coin chance raised from w to buffed w.
 * (Assumes the card is always used and the buff always runs its full length.)
 */
export function luckCardValueCoins(): number {
  const i500 = SEGMENT_INDEX("coins_500");
  const extraChance = (buffedWeights()[i500] - SEGMENT_WEIGHTS[i500]) / TOTAL_WEIGHT;
  return BUFF_ROUNDS * extraChance * WHEEL_SEGMENTS[i500].value;
}

/**
 * Long-run expected return per PAID spin, in coins. The jackpot replaces the ordinary result on every Nth paid spin, so
 * EV = (1 − 1/N) · ordinary + jackpot / N. Free-reading tickets are valued at FREE_READING_VALUE_COINS, luck cards at luckCardValueCoins().
 */
export function expectedReturnPerPaidSpin(every = JACKPOT_EVERY_PAID_SPINS): { ordinary: number; jackpot: number; total: number } {
  let ordinary = 0;
  WHEEL_SEGMENTS.forEach((s, i) => {
    const p = SEGMENT_WEIGHTS[i] / TOTAL_WEIGHT;
    if (s.type === "coins") ordinary += p * s.value;
    else if (s.type === "free_reading") ordinary += p * s.value * FREE_READING_VALUE_COINS;
    else if (s.type === "luck_card") ordinary += p * s.value * luckCardValueCoins();
  });
  const jackpotValue = WHEEL_SEGMENTS[JACKPOT_SEGMENT_INDEX].value;
  const jackpot = jackpotValue / every;
  const ordinaryShare = (1 - 1 / every) * ordinary;
  return { ordinary: ordinaryShare, jackpot, total: ordinaryShare + jackpot };
}

/** Return as a fraction of the spin price (0.35 = players get 35% back, owner keeps 65%). */
export function returnRatio(cost = WHEEL_SPIN_COST): number {
  return expectedReturnPerPaidSpin().total / cost;
}
