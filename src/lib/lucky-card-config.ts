import "server-only";

/**
 * ศูนย์รวมตัวเลขของเกม "ดวงดี มีเฮ" — แก้ที่นี่ที่เดียวเพื่อปรับเรตและรางวัล.
 * Server-only (never import from client code: the odds must not ship to the browser).
 *
 * NOTE: LUCKY_CARD_COST and the bonus whitelist (100/300/500) are ALSO enforced inside the SQL function
 * `play_lucky_card` (migration 0006). If you change the price or add a bonus tier, update the SQL too.
 */

/** Coins charged per round. */
export const LUCKY_CARD_COST = 20;

/** Cards on the table; the player flips one. */
export const LUCKY_CARD_COUNT = 8;

/** Cash value of the secret prize "เทพประทานทรัพย์", in THB. Rate: 1,000 coins = 1,000 THB (1 : 1). */
export const SECRET_PRIZE_THB = 1000;

export type LuckyCardOutcomeKind = "bonus100" | "bonus300" | "bonus500" | "secret" | "message";

/**
 * Chance per round as weights out of ODDS_TOTAL (10,000 = 100%).
 * `message` is whatever is left over, so it is computed — never edit it by hand.
 * Defaults (formula 65/35: owner keeps ~65%, players get back ~35% = 7.0 of every 20 coins), WITH the bonus guarantee below:
 *   natural 100-coin 0.08% · 300-coin 0.55% (1 in ~182) · 500-coin 0.01% · secret prize 0.02% (1 in 5,000) · message 99.34%
 *   + guarantee: after PITY_AFTER_DRY_ROUNDS (50) rounds in a row with no bonus/secret, the next round is a 100-coin bonus.
 * Bonus coins pay out TWICE (coins into the wallet AND towards the 1,000-coin cash-out). Long-run average per round
 * (renewal-reward over one "dry streak" cycle, see expectedReturnPer20) = 7.005 per 20 coins played ≈ 35% returned.
 * The guarantee alone (a forced 100-coin bonus about every 44 rounds) already pays ~4.5 units/round, and the 300-coin tier
 * at 0.55% pays another ~3.3, so the natural 100-coin, 500-coin and secret chances had to be cut to stay at 35%.
 * Assumes every accumulated 1,000 is eventually cashed out; the real figure is a bit lower because partial progress is
 * never withdrawn. Check any edit with expectedReturnPer20() (a unit test pins it to 7.0 ± 0.01).
 */
export const ODDS_TOTAL = 10_000;
export const ODDS = {
  bonus100: 8,
  bonus300: 55,
  bonus500: 1,
  secret: 2,
} as const;

export const ODDS_MESSAGE = ODDS_TOTAL - (ODDS.bonus100 + ODDS.bonus300 + ODDS.bonus500 + ODDS.secret);

/** Ordered table used by the draw: [kind, weight]. */
export const ODDS_TABLE: readonly (readonly [LuckyCardOutcomeKind, number])[] = [
  ["bonus100", ODDS.bonus100],
  ["bonus300", ODDS.bonus300],
  ["bonus500", ODDS.bonus500],
  ["secret", ODDS.secret],
  ["message", ODDS_MESSAGE],
];

/**
 * Bonus guarantee ("pity"): after this many consecutive rounds WITHOUT any bonus or secret prize, the next round is a
 * guaranteed bonus of PITY_BONUS_COINS. 0 disables it. The SQL function play_lucky_card (migration 0008) applies it under
 * the wallet lock; PITY_BONUS_COINS must be 100, 300 or 500.
 */
export const PITY_AFTER_DRY_ROUNDS = 50;
export const PITY_BONUS_COINS = 100;

/** Coins credited for each bonus tier (must stay within the SQL whitelist 100/300/500). */
export const BONUS_COINS = { bonus100: 100, bonus300: 300, bonus500: 500 } as const;

/**
 * Expected payout per round in coin/THB units (1 coin = 1 THB). Bonus coins count twice: once as coins credited to the
 * wallet and once as progress towards the 1,000-THB cash-out. With the guarantee, a "cycle" is the run of rounds from one
 * bonus/secret to the next: up to PITY_AFTER_DRY_ROUNDS natural draws, then (if all were messages) one guaranteed bonus.
 * Renewal-reward: EV = E[payout per cycle] / E[rounds per cycle]. Defaults → 7.005 (35% of 20).
 */
export function expectedReturnPer20(): number {
  const hitWeight = ODDS.bonus100 + ODDS.bonus300 + ODDS.bonus500 + ODDS.secret;
  if (hitWeight === 0) return 0;
  const p = hitWeight / ODDS_TOTAL;
  const q = 1 - p;
  // average payout of one natural hit
  const hitValue =
    (ODDS.bonus100 * 2 * BONUS_COINS.bonus100 +
      ODDS.bonus300 * 2 * BONUS_COINS.bonus300 +
      ODDS.bonus500 * 2 * BONUS_COINS.bonus500 +
      ODDS.secret * SECRET_PRIZE_THB) /
    hitWeight;
  const K = PITY_AFTER_DRY_ROUNDS;
  if (K <= 0) return p * hitValue;
  let rounds = 0;
  for (let g = 1; g <= K; g++) rounds += g * Math.pow(q, g - 1) * p; // first natural hit on round g
  const dry = Math.pow(q, K); // K dry rounds in a row -> guaranteed bonus on round K+1
  rounds += (K + 1) * dry;
  const payout = (1 - dry) * hitValue + dry * 2 * PITY_BONUS_COINS;
  return payout / rounds;
}

/** Throws if the numbers above are inconsistent (used by tests). */
export function validateLuckyCardConfig(): void {
  if (ODDS_MESSAGE < 0) throw new Error("lucky-card odds exceed 100%");
  if (ODDS_TABLE.reduce((s, [, w]) => s + w, 0) !== ODDS_TOTAL) throw new Error("lucky-card odds must sum to ODDS_TOTAL");
  if (!Number.isInteger(SECRET_PRIZE_THB) || SECRET_PRIZE_THB <= 0) throw new Error("SECRET_PRIZE_THB must be a positive integer");
  if (!Number.isInteger(PITY_AFTER_DRY_ROUNDS) || PITY_AFTER_DRY_ROUNDS < 0 || PITY_AFTER_DRY_ROUNDS > 1000) throw new Error("PITY_AFTER_DRY_ROUNDS must be 0..1000");
  if (![100, 300, 500].includes(PITY_BONUS_COINS)) throw new Error("PITY_BONUS_COINS must be 100, 300 or 500");
}
