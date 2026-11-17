import "server-only";
import { randomInt } from "node:crypto";
import { WHEEL_SEGMENTS } from "./segments";

/**
 * Server-side odds for ORDINARY spins. One weight per WHEEL_SEGMENTS entry (same order).
 * The 5,000-coin jackpot segment has weight 0: it is never drawn randomly. It is only awarded by
 * the database on every JACKPOT_EVERY_PAID_SPINS-th PAID (99-coin) spin (RPC `spin_wheel_cycle`),
 * and never for a free-ticket spin. The other weights are the old odds renormalised to 99:
 *
 *  retry 19+18 = 37 · 10 coins 18+17 = 35 · 20 coins 20 · 50 coins 5 · free reading 2  (of 99)
 *
 * NEVER import this from client code — the client only gets segments.ts.
 */
export const SEGMENT_WEIGHTS: readonly number[] = [19, 18, 20, 18, 17, 5, 2, 0];

export const TOTAL_WEIGHT = SEGMENT_WEIGHTS.reduce((a, b) => a + b, 0);

/** Every Nth paid spin (global counter, free-ticket spins excluded) is the 5,000-coin jackpot. */
export const JACKPOT_EVERY_PAID_SPINS = 200;

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
