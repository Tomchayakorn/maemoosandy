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
 * Defaults (target house profit 70%): 100-coin 1.50% · 300-coin 0.40% · 500-coin 0.16% · secret prize 0.25% · message 97.69%.
 * Average payout = 1.5 + 1.2 + 0.8 coins + 2.5 THB (1,000 × 0.25%) = 6 per 20 coins played → 30% returned, 70% kept.
 */
export const ODDS_TOTAL = 10_000;
export const ODDS = {
  bonus100: 150,
  bonus300: 40,
  bonus500: 16,
  secret: 25,
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

/** Throws if the numbers above are inconsistent (used by tests). */
export function validateLuckyCardConfig(): void {
  if (ODDS_MESSAGE < 0) throw new Error("lucky-card odds exceed 100%");
  if (ODDS_TABLE.reduce((s, [, w]) => s + w, 0) !== ODDS_TOTAL) throw new Error("lucky-card odds must sum to ODDS_TOTAL");
  if (!Number.isInteger(SECRET_PRIZE_THB) || SECRET_PRIZE_THB <= 0) throw new Error("SECRET_PRIZE_THB must be a positive integer");
}
