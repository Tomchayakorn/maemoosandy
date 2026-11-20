import "server-only";
import { randomInt } from "node:crypto";
import { WHEEL_SPIN_COST } from "../pricing";
import { WHEEL_SEGMENTS } from "./segments";

/**
 * Server-side odds for ORDINARY spins. One weight per WHEEL_SEGMENTS entry (same order), total 1,000.
 * The 5,000-coin jackpot segment has weight 0: it is never drawn randomly. It is only awarded by
 * the database on every JACKPOT_EVERY_PAID_SPINS-th PAID spin (RPC `spin_wheel_cycle`),
 * and never for a free-ticket spin.
 *
 *  retry 34.4% + 34.4% (two slices) · 25 coins 23% · 50 coins 5.5% · 150 coins 1% · 500 coins 0.2% · free reading 1.5%  (31.2% win something)
 *
 * With WHEEL_SPIN_COST = 50 and the jackpot every 1,000th paid spin, the long-run return is ≈ 17.5 coins per paid spin
 * ≈ 35% (owner keeps ≈ 65%; ordinary prizes ≈ 12.5 + jackpot 5.0); see expectedReturnPerPaidSpin(). The free reading ticket is valued at FREE_READING_VALUE_COINS.
 *
 * NEVER import this from client code — the client only gets segments.ts.
 */
export const SEGMENT_WEIGHTS: readonly number[] = [344, 230, 55, 344, 10, 2, 15, 0];

export const TOTAL_WEIGHT = SEGMENT_WEIGHTS.reduce((a, b) => a + b, 0);

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
export function segmentForRoll(roll: number): number {
  let acc = 0;
  for (let i = 0; i < SEGMENT_WEIGHTS.length; i++) {
    acc += SEGMENT_WEIGHTS[i];
    if (roll < acc) return i;
  }
  throw new RangeError(`roll ${roll} out of range`);
}

/** Cryptographically random weighted pick of an ORDINARY reward (never the jackpot). */
export function pickStandardReward() {
  const segmentIndex = segmentForRoll(randomInt(TOTAL_WEIGHT));
  return { segmentIndex, segment: WHEEL_SEGMENTS[segmentIndex] };
}

/**
 * Long-run expected return per PAID spin, in coins. The jackpot replaces the ordinary result on every Nth paid spin, so
 * EV = (1 − 1/N) · ordinary + jackpot / N. Free-reading tickets are valued at FREE_READING_VALUE_COINS.
 */
export function expectedReturnPerPaidSpin(every = JACKPOT_EVERY_PAID_SPINS): { ordinary: number; jackpot: number; total: number } {
  let ordinary = 0;
  WHEEL_SEGMENTS.forEach((s, i) => {
    const p = SEGMENT_WEIGHTS[i] / TOTAL_WEIGHT;
    if (s.type === "coins") ordinary += p * s.value;
    else if (s.type === "free_reading") ordinary += p * s.value * FREE_READING_VALUE_COINS;
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
