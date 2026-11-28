/**
 * "วงล้อไต่ชั้น" (Power Wheel Climb) — client-safe constants and exact integer math. The database is the source of truth
 * (migration 0021: power_multiplier_bp / power_danger_count / power_slice_is_danger / the three RPCs); a unit test pins the tables in the SQL to this file.
 *
 * Rules: the wheel has 10 slices. On level k, DANGER[k-1] of them are danger slices (the rest are safe). One spin lands on one slice, chosen
 * uniformly with crypto on the server. Safe → the player climbs to the next level and the multiplier grows; danger → the round is lost.
 * The player may stop and take the coins after clearing at least one level. Multiplier after clearing k levels = (1 − house edge) ÷ P(k safe in a row),
 * so EVERY stopping strategy has the same expected return (1 − edge) before rounding and the cap.
 * Separate from the old lucky wheel: no free tickets, no jackpot counter, no withdrawal flow — prizes go to the coin wallet only.
 */
export const SLICES = 10;
export const BETS = [10, 20, 50, 100] as const;
export type Bet = (typeof BETS)[number];

/** House edge in basis points (1000 = 10%). Changing it needs the SQL multiplier table (0021) to change too. */
export const EDGE_BP = 1000;
/** Max payout of one round, in coins (also enforced inside the SQL functions). */
export const MAX_PAYOUT = 3000;

/** Danger slices on level 1..MAX_LEVEL. */
export const DANGER: readonly number[] = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6];
export const MAX_LEVEL = DANGER.length;

/** The order in which slices turn dangerous: level k's danger slices are the first DANGER[k-1] entries (spread around the wheel). */
export const DANGER_ORDER: readonly number[] = [0, 5, 2, 7, 4, 9, 1, 6, 3, 8];

export function dangerCount(level: number): number | null {
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL ? DANGER[level - 1] : null;
}

export function dangerSlices(level: number): number[] {
  const d = dangerCount(level);
  return d === null ? [] : DANGER_ORDER.slice(0, d);
}

export function isDangerSlice(level: number, slice: number): boolean {
  return dangerSlices(level).includes(slice);
}

/** Chance (0..1) that a spin on this level is safe. */
export function safeProbability(level: number): number {
  const d = dangerCount(level);
  return d === null ? 0 : (SLICES - d) / SLICES;
}

/** Multiplier after clearing k levels, in basis points (10000 = ×1.00), floored: (10000 − edge) × 10^k ÷ Π(10 − danger_i). Null when k is impossible. */
export function multiplierBp(k: number): number | null {
  if (!Number.isInteger(k) || k < 1 || k > MAX_LEVEL) return null;
  let den = 1;
  for (let i = 0; i < k; i++) den *= SLICES - DANGER[i];
  const num = (10_000 - EDGE_BP) * SLICES ** k; // ≤ 9e15 < 2^53: exact
  return (num - (num % den)) / den; // exact floored division (a float division could round up near an integer)
}

/** Coins paid when stopping after clearing k levels: floor(bet × multiplier), never above MAX_PAYOUT. */
export function payoutFor(bet: number, k: number): number {
  const bp = multiplierBp(k);
  if (bp === null) return 0;
  return Math.min(Math.floor((bet * bp) / 10_000), MAX_PAYOUT);
}

/** True when the uncapped payout already reaches the cap: the round pays out by itself. */
export function reachesCap(bet: number, k: number): boolean {
  const bp = multiplierBp(k);
  return bp !== null && Math.floor((bet * bp) / 10_000) >= MAX_PAYOUT;
}

/** P(clearing k levels in a row). */
export function reachProbability(k: number): number {
  let p = 1;
  for (let i = 1; i <= k; i++) p *= safeProbability(i);
  return p;
}

/** Expected return (fraction of the bet) of the strategy "stop after clearing k levels" — includes rounding and the cap. */
export function strategyReturn(bet: number, k: number): number {
  return (reachProbability(k) * payoutFor(bet, k)) / bet;
}

export type RoundStatus = "active" | "cashed" | "lost" | "cleared";

/* ---------------------------------------------------------------------------------------------------------------------------------------
 * Bonus multipliers (migration 0023, "bonus rounds" = version 2). Clearing BONUS_UNLOCK_LEVEL draws ×1/×2/×5/×8 ONCE for the round (the
 * server rolls 0..999, the database maps it and stores it). From that level on the table is the old one divided by the average bonus, so
 * every stopping strategy still returns at most 1 − edge: the bonus is paid for by the lower base, not by the house.
 * ------------------------------------------------------------------------------------------------------------------------------------- */
export type RulesVersion = 1 | 2;
export type Bonus = 1 | 2 | 5 | 8;
export const BONUS_UNLOCK_LEVEL = 3;
/** Rolls are 0..BONUS_ROLLS−1; each row takes `rolls` of them, from the top of the list down; the rest are ×1. */
export const BONUS_ROLLS = 1000;
export const BONUS_ODDS: readonly { bonus: Exclude<Bonus, 1>; rolls: number }[] = [
  { bonus: 8, rolls: 4 },
  { bonus: 5, rolls: 10 },
  { bonus: 2, rolls: 50 },
];
/** Rolls that give no bonus (×1). */
export const NO_BONUS_ROLLS = BONUS_ROLLS - BONUS_ODDS.reduce((a, o) => a + o.rolls, 0);
/** Average multiplier × 1000 (1118 = ×1.118): what the base table is divided by from the unlock level on. */
export const BONUS_AVERAGE_1000 = NO_BONUS_ROLLS + BONUS_ODDS.reduce((a, o) => a + o.bonus * o.rolls, 0);

/** The multiplier a roll gives; null for anything that is not a roll. */
export function bonusForRoll(roll: number): Bonus | null {
  if (!Number.isInteger(roll) || roll < 0 || roll >= BONUS_ROLLS) return null;
  let from = 0;
  for (const o of BONUS_ODDS) {
    if (roll < (from += o.rolls)) return o.bonus;
  }
  return 1;
}

/** Base multiplier (before the bonus) after clearing k levels under a rules version, basis points. */
export function baseMultiplierBp(k: number, version: RulesVersion = 1): number | null {
  const old = multiplierBp(k);
  if (old === null || version === 1 || k < BONUS_UNLOCK_LEVEL) return old;
  let den = BigInt(1);
  for (let i = 0; i < k; i++) den *= BigInt(SLICES - DANGER[i]);
  // the same exact fraction as the old table, divided by the average bonus, floored once (BigInt: the numerator passes 2^53)
  return Number((BigInt(10_000 - EDGE_BP) * BigInt(SLICES) ** BigInt(k) * BigInt(1000)) / (den * BigInt(BONUS_AVERAGE_1000)));
}

/** Coins before the cap. `bonus` is null while locked (counts as ×1) and is ignored in a version 1 round. */
function rawPayout(bet: number, k: number, version: RulesVersion, bonus: Bonus | null): number {
  const bp = baseMultiplierBp(k, version);
  return bp === null ? 0 : Math.floor((bet * bp * (version === 2 ? (bonus ?? 1) : 1)) / 10_000);
}

/** What a round of this version and bonus pays after clearing k levels, never above MAX_PAYOUT. */
export function roundPayout(bet: number, k: number, version: RulesVersion = 1, bonus: Bonus | null = null): number {
  return Math.min(rawPayout(bet, k, version, bonus), MAX_PAYOUT);
}

export function roundReachesCap(bet: number, k: number, version: RulesVersion = 1, bonus: Bonus | null = null): boolean {
  return rawPayout(bet, k, version, bonus) >= MAX_PAYOUT;
}
