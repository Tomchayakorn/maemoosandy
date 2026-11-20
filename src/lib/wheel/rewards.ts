import "server-only";
import { randomInt } from "node:crypto";
import { WHEEL_SPIN_COST } from "../pricing";
import { WHEEL_CASH_PCT } from "./cash";
import { HOT_STREAK_ROUNDS, HOT_TRIGGER_ONE_IN } from "./hot-streak";
import { BUFF_MULTIPLIER, BUFF_ROUNDS } from "./luck-card";
import { WHEEL_SEGMENTS } from "./segments";

/**
 * Server-side odds for ORDINARY spins. One weight per WHEEL_SEGMENTS entry (same order), total 10,000 (= 100%).
 * The 5,000-coin jackpot segment has weight 0: it is never drawn randomly. It is only awarded by
 * the database on every JACKPOT_EVERY_PAID_SPINS-th PAID spin (RPC `spin_wheel_cycle`),
 * and never for a free-ticket spin.
 *
 *  retry 71.6% · 20 coins 19% · 40 coins 5.2% · "การ์ด +ความเฮง" 1.5% · 120 coins 1% · 400 coins 0.2% · free reading 1.5%
 *  (28.4% of normal spins win something, the card included). Lowered from 20% / 5.5% to pay for the hot streak below.
 *
 * While the luck-card buff is active the draw changes (see buffedWeights): "retry" is REMOVED (every spin of the buff wins something),
 * the 400-coin weight is multiplied by BUFF_MULTIPLIER, and all the weight "retry" used to have goes to the cheapest prize (20 coins).
 * 40/120/card/free-reading keep their weights. Giving the freed weight to 25 keeps the buff affordable; spreading it proportionally would
 * make a buffed spin return ~78% of its price.
 *
 * With WHEEL_SPIN_COST = 50 and the jackpot every 1,000th paid spin, the long-run return is ≈ 17.5 coins per paid spin
 * ≈ 35% (owner keeps ≈ 65%); see expectedReturnPerPaidSpin(). The free reading ticket is valued at FREE_READING_VALUE_COINS and a
 * luck card at luckCardValueCoins().
 *
 * NEVER import this from client code — the client only gets segments.ts.
 */
export const SEGMENT_WEIGHTS: readonly number[] = [7160, 1900, 520, 150, 100, 20, 150, 0];

export const TOTAL_WEIGHT = SEGMENT_WEIGHTS.reduce((a, b) => a + b, 0);

const SEGMENT_INDEX = (key: string) => WHEEL_SEGMENTS.findIndex((s) => s.key === key);

/**
 * Weights while the luck-card buff is active (total unchanged): "retry" → 0 (every buffed spin wins), 400-coin × BUFF_MULTIPLIER,
 * and the weight "retry" had (minus what the 400-coin boost needs) goes to the 20-coin prize. Everything else is untouched.
 */
export function buffedWeights(): readonly number[] {
  const w = [...SEGMENT_WEIGHTS];
  const i500 = SEGMENT_INDEX("coins_400");
  const iRetry = SEGMENT_INDEX("retry_a");
  const i20 = SEGMENT_INDEX("coins_20");
  const extra = Math.round(w[i500] * (BUFF_MULTIPLIER - 1));
  if (extra > w[iRetry]) throw new RangeError("not enough retry weight to fund the luck-card buff");
  w[i20] += w[iRetry] - extra;
  w[i500] += extra;
  w[iRetry] = 0;
  return w;
}

/**
 * Odds of a spin INSIDE a "มือขึ้น 5 ตาติด" hot streak (total 10,000, same slice order): 80% coin prize (20: 60% · 40: 17% · 120: 2.5% · 400: 0.5%),
 * 2% free reading, 18% retry; no luck card (cards cannot chain) and no jackpot. Weighted to the small prizes on purpose: the streak keeps the rhythm
 * and feeds the 25% cash tally without a big payout spike. A streak starts after a paid spin with probability 1 / HOT_TRIGGER_ONE_IN and lasts
 * HOT_STREAK_ROUNDS spins; while the luck-card buff runs, the buff's own draw (always a prize) is used instead.
 */
export const HOT_WEIGHTS: readonly number[] = [1800, 6000, 1700, 0, 250, 50, 200, 0];

/** Share of all spins that are hot spins in the long run: a streak of N spins starts with probability e on each non-hot PAID spin. */
export function hotSpinShare(): number {
  const e = 1 / HOT_TRIGGER_ONE_IN;
  return (HOT_STREAK_ROUNDS * e) / (1 + HOT_STREAK_ROUNDS * e);
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

/** Cryptographically random weighted pick of an ORDINARY reward (never the jackpot). `buffed` = luck-card odds, `hot` = hot-streak odds. */
export function pickStandardReward(opts: { buffed?: boolean; hot?: boolean } = {}) {
  const weights = opts.buffed ? buffedWeights() : opts.hot ? HOT_WEIGHTS : SEGMENT_WEIGHTS;
  const segmentIndex = segmentForRoll(randomInt(TOTAL_WEIGHT), weights);
  return { segmentIndex, segment: WHEEL_SEGMENTS[segmentIndex] };
}

/**
 * What one PAID spin returns on average with these weights; luck cards excluded. Coin prizes count (1 + WHEEL_CASH_PCT/100) times:
 * the coins go to the wallet AND WHEEL_CASH_PCT % of them also go to the cash tally (withdrawable at 1 : 1 — the budget assumes every
 * tally coin is eventually cashed out; jackpot spins are excluded from the tally but are a tiny share). Free-reading tickets at their
 * nominal value.
 */
function coinsEv(weights: readonly number[]): number {
  let ev = 0;
  WHEEL_SEGMENTS.forEach((s, i) => {
    const p = weights[i] / TOTAL_WEIGHT;
    if (s.type === "coins") ev += p * s.value * (1 + WHEEL_CASH_PCT / 100);
    else if (s.type === "free_reading") ev += p * s.value * FREE_READING_VALUE_COINS;
  });
  return ev;
}

/**
 * Average value of ONE luck card in coins: it turns BUFF_ROUNDS normal spins into buffed spins, so
 *   V = BUFF_ROUNDS · (EV_buffed − EV_normal) / (1 − BUFF_ROUNDS · (pCard_buffed − pCard_normal)).
 * The denominator accounts for cards won during a buff (they start another buff later). Assumes every card is used.
 */
export function luckCardValueCoins(): number {
  const iCard = WHEEL_SEGMENTS.findIndex((s) => s.type === "luck_card");
  const base = SEGMENT_WEIGHTS;
  const buffed = buffedWeights();
  const gain = coinsEv(buffed) - coinsEv(base);
  const chain = (buffed[iCard] - base[iCard]) / TOTAL_WEIGHT;
  return (BUFF_ROUNDS * gain) / (1 - BUFF_ROUNDS * chain);
}

/**
 * Long-run expected return per PAID spin, in coins. The jackpot replaces the ordinary result on every Nth paid spin, so
 * EV = (1 − 1/N) · ordinary + jackpot / N, with ordinary = (1 − f) · normal-spin coins + f · hot-spin coins + (1 − f) · P(card) · luckCardValueCoins(),
 * where f = hotSpinShare(). (Overlap of a buff and a hot streak is ignored here — it is rare; the unit-test simulation includes it.)
 */
export function expectedReturnPerPaidSpin(every = JACKPOT_EVERY_PAID_SPINS): { ordinary: number; jackpot: number; total: number } {
  const iCard = WHEEL_SEGMENTS.findIndex((s) => s.type === "luck_card");
  // hot spins (share f of all spins) use HOT_WEIGHTS: no luck card there, so the card is won on (1 − f) of the spins
  const f = hotSpinShare();
  const ordinary = (1 - f) * coinsEv(SEGMENT_WEIGHTS) + f * coinsEv(HOT_WEIGHTS) + (1 - f) * (SEGMENT_WEIGHTS[iCard] / TOTAL_WEIGHT) * luckCardValueCoins();
  const jackpotValue = WHEEL_SEGMENTS[JACKPOT_SEGMENT_INDEX].value;
  const jackpot = jackpotValue / every;
  const ordinaryShare = (1 - 1 / every) * ordinary;
  return { ordinary: ordinaryShare, jackpot, total: ordinaryShare + jackpot };
}

/** Return as a fraction of the spin price (0.35 = players get 35% back, owner keeps 65%). */
export function returnRatio(cost = WHEEL_SPIN_COST): number {
  return expectedReturnPerPaidSpin().total / cost;
}
