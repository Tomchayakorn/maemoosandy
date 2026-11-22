/**
 * "เปิดหีบมนตรา" (Mystic Chests) — client-safe constants and exact integer math. The database is the source of truth
 * (migration 0020: mystic_multiplier_bp / mystic_payout / the three RPCs); a unit test pins the multiplier table in the SQL to this file.
 *
 * Rules: 9 chests (3×3), `mines` cursed chests hidden among them (1–3). Each safe chest raises the multiplier; the player may cash out
 * after at least one safe chest. Multiplier after k safe chests = (1 − house edge) ÷ P(k safe in a row), so EVERY stopping strategy has the
 * same expected return (1 − edge) before rounding and the cap.
 */
export const TILES = 9;
export const BETS = [10, 20, 50, 100] as const;
export type Bet = (typeof BETS)[number];
export const MINES_OPTIONS = [1, 2, 3] as const;
export type Mines = (typeof MINES_OPTIONS)[number];

/** House edge in basis points (1000 = 10%). Changing it needs the SQL multiplier table (0020) to change too. */
export const EDGE_BP = 1000;
/** Max payout of one round, in coins (applied inside the SQL functions as well). */
export const MAX_PAYOUT = 5000;

export function maxSafe(mines: number): number {
  return TILES - mines;
}

/** Multiplier after k safe chests, in basis points (10000 = ×1.00), floored: (10000 − edge) × Π(9−i)/(9−mines−i). Null when k is impossible. */
export function multiplierBp(mines: number, k: number): number | null {
  if (!Number.isInteger(mines) || mines < 1 || mines > 3 || !Number.isInteger(k) || k < 1 || k > maxSafe(mines)) return null;
  // all values stay far below 2^53 (max 9·8·…·2 · 9000 ≈ 3.3e9), so integer arithmetic on numbers is exact; the quotient is floored like the SQL
  let num = 1;
  let den = 1;
  for (let i = 0; i < k; i++) {
    num *= TILES - i;
    den *= TILES - mines - i;
  }
  return Math.floor(((10_000 - EDGE_BP) * num) / den);
}

/** Coins paid when cashing out after k safe chests: floor(bet × multiplier), never above MAX_PAYOUT. */
export function payoutFor(bet: number, mines: number, k: number): number {
  const bp = multiplierBp(mines, k);
  if (bp === null) return 0;
  return Math.min(Math.floor((bet * bp) / 10_000), MAX_PAYOUT);
}

/** True when the uncapped payout already reaches the cap: the round pays out by itself. */
export function reachesCap(bet: number, mines: number, k: number): boolean {
  const bp = multiplierBp(mines, k);
  return bp !== null && Math.floor((bet * bp) / 10_000) >= MAX_PAYOUT;
}

/** P(k safe chests in a row). */
export function reachProbability(mines: number, k: number): number {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (TILES - mines - i) / (TILES - i);
  return p;
}

/** Expected return (fraction of the bet) of the strategy "cash out after k safe chests" — includes rounding and the cap. */
export function strategyReturn(bet: number, mines: number, k: number): number {
  return (reachProbability(mines, k) * payoutFor(bet, mines, k)) / bet;
}

export function popcount(mask: number): number {
  let n = 0;
  for (let m = mask; m > 0; m >>= 1) n += m & 1;
  return n;
}

export type RoundStatus = "active" | "cashed" | "lost" | "cleared";
