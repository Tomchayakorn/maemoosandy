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
 * Defaults (target: players get back ~30% on average, owner keeps ~70%):
 *   100-coin 2.22% (1 in ~45, frequent so the progress bar keeps moving) · 300-coin 0.16% (1 in 625, shows up now and then)
 *   · 500-coin 0.01% (1 in 10,000) · secret prize 0.05% (1 in 2,000) · message 97.56%.
 * Bonus coins pay out TWICE (coins into the wallet AND towards the 1,000-coin cash-out), so:
 *   bonus EV = 2.22 + 0.48 + 0.05 = 2.75 coins/round  →  counted twice = 5.5
 *   secret EV = 1,000 THB × 0.05% = 0.5
 *   total = 6.0 per 20 coins played = 30% returned (assumes every accumulated 1,000 is eventually cashed out; the real
 *   figure is a bit lower because partial progress is never withdrawn). Budget rule: a + 3b + 5c + 5s = 300 (weights of 100/300/500/secret)
 *   keeps the total at exactly 6.0. Use expectedReturnPer20() to check any edit.
 */
export const ODDS_TOTAL = 10_000;
export const ODDS = {
  bonus100: 222,
  bonus300: 16,
  bonus500: 1,
  secret: 5,
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

/** Coins credited for each bonus tier (must stay within the SQL whitelist 100/300/500). */
export const BONUS_COINS = { bonus100: 100, bonus300: 300, bonus500: 500 } as const;

/**
 * Expected payout per round, in coin/THB units (1 coin = 1 THB). Bonus coins are counted twice: once as coins credited
 * to the wallet and once as progress towards the 1,000-THB cash-out. Defaults → 6.0 (30% of 20).
 */
export function expectedReturnPer20(): number {
  const bonusEv = (ODDS.bonus100 * BONUS_COINS.bonus100 + ODDS.bonus300 * BONUS_COINS.bonus300 + ODDS.bonus500 * BONUS_COINS.bonus500) / ODDS_TOTAL;
  const secretEv = (ODDS.secret * SECRET_PRIZE_THB) / ODDS_TOTAL;
  return 2 * bonusEv + secretEv;
}

/** Throws if the numbers above are inconsistent (used by tests). */
export function validateLuckyCardConfig(): void {
  if (ODDS_MESSAGE < 0) throw new Error("lucky-card odds exceed 100%");
  if (ODDS_TABLE.reduce((s, [, w]) => s + w, 0) !== ODDS_TOTAL) throw new Error("lucky-card odds must sum to ODDS_TOTAL");
  if (!Number.isInteger(SECRET_PRIZE_THB) || SECRET_PRIZE_THB <= 0) throw new Error("SECRET_PRIZE_THB must be a positive integer");
}
