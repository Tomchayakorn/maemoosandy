/**
 * "จับคู่ภาพเหมือน" — client-safe constants. The database is the source of truth (migration 0022: match_start / match_flip); a unit test pins
 * the numbers in the SQL to this file.
 *
 * Rules: 12 face-down cards (6 pairs), 20 coins a round, up to 12 turns (a turn = 2 cards). Each pair found pays 5 at once; finding all 6
 * adds a 15-coin clear bonus (45 at most). 3 rounds per Bangkok calendar day.
 */
export const PAIRS = 6;
export const CARDS = PAIRS * 2;
export const COST = 20;
export const MAX_TURNS = 12;
export const PAIR_REWARD = 5;
export const CLEAR_BONUS = 15;
export const DAILY_ROUNDS = 3;
export const MAX_PAYOUT = PAIRS * PAIR_REWARD + CLEAR_BONUS;
/** How long two cards that do not match stay face up before they turn back. */
export const REVEAL_MS = 1000;

/** The six auspicious symbols; the number in the layout is the index here. */
export const SYMBOLS = ["ดอกบัวมงคล", "จันทร์เสี้ยว", "ดาวแปดแฉก", "ลูกแก้วทำนาย", "เทียนนำโชค", "ระฆังมงคล"] as const;

/** Coins a round has paid after finding `pairs` pairs. */
export function payoutFor(pairs: number): number {
  const p = Math.min(Math.max(Math.floor(pairs), 0), PAIRS);
  return p * PAIR_REWARD + (p === PAIRS ? CLEAR_BONUS : 0);
}

export const roundsLeft = (roundsToday: number) => Math.max(0, DAILY_ROUNDS - roundsToday);
