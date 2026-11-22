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
 * Target (set 2026-11-22): players get back ~46% (owner keeps ~54%) = ~9.2 of every 20 coins, bonus coins counted twice
 * (coins into the wallet AND towards the 1,000-coin cash-out), secret prize at its cash value. Pinned by a unit test.
 * Natural chances: 100-coin / 300-coin / 500-coin bonus and the secret prize (see ODDS). On top of them the TWO-STEP guarantee below.
 * Assumes every accumulated 1,000 is eventually cashed out; the real figure is a bit lower because partial progress is
 * never withdrawn. Check any edit with expectedReturnPer20() (analytic Markov chain) — the test also runs a 1,000,000-round simulation.
 */
export const ODDS_TOTAL = 10_000;
export const ODDS = {
  bonus100: 16,
  bonus300: 52,
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
 * Two-step guarantee ("stairs"). Both apply only to a round that would otherwise be a plain message:
 *   step 1: every GUARANTEE_DRY_ROUNDS-th round in a row WITHOUT any bonus/secret is a bonus of GUARANTEE_DRY_COINS (the dry
 *           streak resets on any bonus/secret, natural or guaranteed);
 *   step 2: every GUARANTEE_EVERY_ROUNDS-th round overall (a continuous count that natural wins do NOT reset) is a bonus of
 *           GUARANTEE_EVERY_COINS. When both are due the bigger one (step 2) is paid and the dry streak resets.
 * Applied by the SQL function play_lucky_card (migration 0015) under the wallet lock; the route passes these numbers.
 * Counters: wallets.lucky_card_dry_rounds (step 1) and wallets.lucky_card_cycle_rounds (step 2).
 */
export const GUARANTEE_DRY_ROUNDS = 10;
export const GUARANTEE_DRY_COINS = 15;
export const GUARANTEE_EVERY_ROUNDS = 25;
export const GUARANTEE_EVERY_COINS = 40;

/** Coins credited for each natural bonus tier (must stay within the SQL whitelist 100/300/500). */
export const BONUS_COINS = { bonus100: 100, bonus300: 300, bonus500: 500 } as const;

/**
 * Expected payout per round in coin/THB units (1 coin = 1 THB), bonus coins counted twice, secret once.
 * Exact value from the stationary distribution of the (dry streak, 25-round cycle) Markov chain.
 */
export function expectedReturnPer20(): number {
  const G1 = GUARANTEE_DRY_ROUNDS, G2 = GUARANTEE_EVERY_ROUNDS;
  const pm = ODDS_MESSAGE / ODDS_TOTAL;
  const hitP = 1 - pm;
  const hitValue =
    (ODDS.bonus100 * 2 * BONUS_COINS.bonus100 + ODDS.bonus300 * 2 * BONUS_COINS.bonus300 +
      ODDS.bonus500 * 2 * BONUS_COINS.bonus500 + ODDS.secret * SECRET_PRIZE_THB) / ODDS_TOTAL; // expected natural payout (already x probability)
  const D = G1 > 0 ? G1 : 1, C = G2 > 0 ? G2 : 1;
  const idx = (d: number, c: number) => d * C + c;
  const n = D * C;
  type Edge = { to: number; p: number };
  const edges: Edge[][] = [];
  const reward: number[] = new Array(n).fill(0);
  for (let d = 0; d < D; d++) {
    for (let c = 0; c < C; c++) {
      const from = idx(d, c);
      const nc = G2 > 0 ? (c + 1 >= G2 ? 0 : c + 1) : 0;
      const e: Edge[] = [];
      // natural bonus/secret: dry streak resets, cycle continues
      if (hitP > 0) e.push({ to: idx(0, nc), p: hitP });
      let msgPayout = 0;
      const nd = d + 1 >= D ? D : d + 1;
      let tod = nd;
      if (G2 > 0 && c + 1 >= G2) { msgPayout = 2 * GUARANTEE_EVERY_COINS; tod = 0; }
      else if (G1 > 0 && d + 1 >= G1) { msgPayout = 2 * GUARANTEE_DRY_COINS; tod = 0; }
      else if (G1 <= 0) tod = 0;
      e.push({ to: idx(Math.min(tod, D - 1), nc), p: pm });
      edges[from] = e;
      reward[from] = hitValue + pm * msgPayout;
    }
  }
  let pi = new Array(n).fill(1 / n);
  for (let it = 0; it < 4000; it++) {
    const next = pi.slice().map((x) => x * 0.5);
    for (let s = 0; s < n; s++) for (const { to, p } of edges[s]) next[to] += 0.5 * pi[s] * p;
    pi = next;
  }
  let ev = 0;
  for (let s = 0; s < n; s++) ev += pi[s] * reward[s];
  return ev;
}

/** Throws if the numbers above are inconsistent (used by tests). */
export function validateLuckyCardConfig(): void {
  if (ODDS_MESSAGE < 0) throw new Error("lucky-card odds exceed 100%");
  if (ODDS_TABLE.reduce((s, [, w]) => s + w, 0) !== ODDS_TOTAL) throw new Error("lucky-card odds must sum to ODDS_TOTAL");
  if (!Number.isInteger(SECRET_PRIZE_THB) || SECRET_PRIZE_THB <= 0) throw new Error("SECRET_PRIZE_THB must be a positive integer");
  if (!Number.isInteger(GUARANTEE_DRY_ROUNDS) || GUARANTEE_DRY_ROUNDS < 1 || GUARANTEE_DRY_ROUNDS > 1000) throw new Error("GUARANTEE_DRY_ROUNDS must be 1..1000");
  if (!Number.isInteger(GUARANTEE_EVERY_ROUNDS) || GUARANTEE_EVERY_ROUNDS < 1 || GUARANTEE_EVERY_ROUNDS > 1000) throw new Error("GUARANTEE_EVERY_ROUNDS must be 1..1000");
  for (const c of [GUARANTEE_DRY_COINS, GUARANTEE_EVERY_COINS]) if (!Number.isInteger(c) || c < 1 || c > 500) throw new Error("guarantee coins must be 1..500");
}
