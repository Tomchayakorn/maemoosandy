import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BETS, BONUS_AVERAGE_1000, BONUS_ODDS, BONUS_ROLLS, BONUS_UNLOCK_LEVEL, DANGER, MAX_LEVEL, MAX_PAYOUT, NO_BONUS_ROLLS, SLICES, baseMultiplierBp, bonusForRoll,
  dangerSlices, isDangerSlice, multiplierBp, payoutFor, roundPayout, roundReachesCap, safeProbability, type Bonus,
} from "./config";
import { newState, spin, spinBonus, start, startBonus, stop } from "./model";
import { toRoundView } from "./types";

const BONUSES: Bonus[] = [1, 2, 5, 8];
const chance = (b: Bonus) => (b === 1 ? NO_BONUS_ROLLS : BONUS_ODDS.find((o) => o.bonus === b)!.rolls) / BONUS_ROLLS;

/** Exact expected return of a bonus round: `choose` decides at every level whether to go on (it may look at the multiplier). */
function expectedReturn(bet: number, target: number | "best"): number {
  const value = (k: number, bonus: Bonus | null): number => {
    const paid = roundPayout(bet, k, 2, bonus);
    if (k === MAX_LEVEL || roundReachesCap(bet, k, 2, bonus)) return paid;
    const next = k + 1;
    const afterSafe = next === BONUS_UNLOCK_LEVEL ? BONUSES.reduce((a, b) => a + chance(b) * value(next, b), 0) : value(next, bonus);
    const on = safeProbability(next) * afterSafe;
    if (target === "best") return Math.max(paid, on);
    return k >= target ? paid : on;
  };
  return (safeProbability(1) * value(1, null)) / bet;
}

describe("power wheel bonus", () => {
  it("draws x1 / x2 / x5 / x8 with the agreed odds", () => {
    const seen = { 1: 0, 2: 0, 5: 0, 8: 0 };
    for (let roll = 0; roll < BONUS_ROLLS; roll++) seen[bonusForRoll(roll)!]++;
    expect(seen).toEqual({ 1: 936, 2: 50, 5: 10, 8: 4 });
    expect(BONUS_AVERAGE_1000).toBe(1118);
    for (const bad of [-1, 1000, 1.5, NaN]) expect(bonusForRoll(bad)).toBeNull();
  });

  it("keeps levels 1-2, divides the table by the average bonus from level 3, and still pays more on every level", () => {
    expect(Array.from({ length: MAX_LEVEL }, (_, i) => baseMultiplierBp(i + 1, 2))).toEqual([10000, 11111, 12422, 15528, 22183, 31691, 52818, 88031, 176062, 352125, 880313, 2200782]);
    for (let k = 1; k <= MAX_LEVEL; k++) {
      expect(baseMultiplierBp(k, 1)).toBe(multiplierBp(k));
      if (k < BONUS_UNLOCK_LEVEL) expect(baseMultiplierBp(k, 2)).toBe(multiplierBp(k));
      if (k > 1) expect(baseMultiplierBp(k, 2)!).toBeGreaterThan(baseMultiplierBp(k - 1, 2)!);
    }
    expect([1, 2, 5, 8].map((b) => roundPayout(100, 3, 2, b as Bonus))).toEqual([124, 248, 621, 993]);
    expect(roundPayout(100, 3, 1, 8)).toBe(payoutFor(100, 3)); // an old round ignores any bonus
    expect(roundPayout(100, 2, 2, null)).toBe(111);
    expect(baseMultiplierBp(13, 2)).toBeNull();
  });

  it("never pays above the cap; a bigger bonus reaches it sooner", () => {
    for (const bet of BETS) for (let k = 1; k <= MAX_LEVEL; k++) for (const b of BONUSES) expect(roundPayout(bet, k, 2, b)).toBeLessThanOrEqual(MAX_PAYOUT);
    const first = (b: Bonus) => Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).find((k) => roundReachesCap(100, k, 2, b));
    expect(BONUSES.map(first)).toEqual([10, 9, 8, 7]);
    // nothing can reach the cap on the unlock level itself
    expect(roundReachesCap(100, BONUS_UNLOCK_LEVEL, 2, 8)).toBe(false);
  });

  it("no way of playing returns more than 90% (the house edge is unchanged)", () => {
    for (const bet of BETS) {
      const best = expectedReturn(bet, "best");
      expect(best).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(best).toBeGreaterThan(0.899);
      for (let k = 1; k <= MAX_LEVEL; k++) expect(expectedReturn(bet, k)).toBeLessThanOrEqual(0.9 + 1e-9);
    }
    // below the levels where the cap bites (x8 reaches it at level 7), every stopping level stays close to 90% on a 100 bet
    for (let k = 1; k <= 6; k++) expect(expectedReturn(100, k)).toBeGreaterThan(0.89);
  });
});

describe("power wheel bonus rules (reference model)", () => {
  const safe = (level: number) => [...Array(SLICES).keys()].find((s) => !isDangerSlice(level, s))!;

  it("unlocks once on the unlock level and pays once with the bonus", () => {
    const s = newState(500);
    const r = startBonus(s, 100);
    expect(spinBonus(s, r.id, safe(1), 0).unlocked).toBe(false);
    expect(spinBonus(s, r.id, safe(2), 0).round.bonus).toBeUndefined();
    expect(spinBonus(s, r.id, safe(3), 5).unlocked).toBe(true);
    expect([r.bonus, r.payout]).toEqual([5, 621]);
    expect(spinBonus(s, r.id, safe(4), 0).unlocked).toBe(false);
    expect([r.bonus, r.payout]).toEqual([5, 776]);
    stop(s, r.id);
    expect(s.balance).toBe(400 + 776);
    expect(() => spinBonus(s, r.id, 1, 0)).toThrow("ROUND_NOT_ACTIVE");
    expect(s.balance).toBe(500 + s.ledger.reduce((a, l) => a + l.delta, 0));
  });

  it("loses the bet on a danger slice whatever the bonus, and pays the cap by itself", () => {
    const s = newState(500);
    const lost = startBonus(s, 100);
    for (let k = 1; k <= 3; k++) spinBonus(s, lost.id, safe(k), 0);
    expect(spinBonus(s, lost.id, dangerSlices(4)[0], 0).failed).toBe(true);
    expect(s.balance).toBe(400);
    const big = startBonus(s, 100);
    for (let k = 1; k <= 6; k++) expect(spinBonus(s, big.id, safe(k), 0).auto).toBeNull();
    expect(spinBonus(s, big.id, safe(7), 0).auto).toBe("cap");
    expect(s.balance).toBe(300 + 3000);
  });

  it("leaves old-rule rounds exactly as before and refuses bad input", () => {
    const a = newState(500);
    const b = newState(500);
    const ra = start(a, 100);
    const rb = start(b, 100);
    for (let k = 1; k <= 4; k++) {
      spin(a, ra.id, safe(k));
      spinBonus(b, rb.id, safe(k), 0);
    }
    expect(rb).toEqual(ra);
    expect(() => spinBonus(b, rb.id, 1, 1000)).toThrow("INVALID_REWARD");
    expect(() => spinBonus(b, rb.id, 10, 0)).toThrow("INVALID_SLICE");
  });

  it("reads a response from before and after migration 0023", () => {
    const raw = { round_id: "a", status: "active" as const, bet: 10, level: 3, payout: 13, balance: 1 };
    expect(toRoundView(raw)).toMatchObject({ version: 1, bonus: null, unlocked: false });
    expect(toRoundView({ ...raw, bonus_version: 2, bonus: 8, unlocked: true })).toMatchObject({ version: 2, bonus: 8, unlocked: true });
    expect(toRoundView({ ...raw, bonus_version: 2, bonus: 3 }).bonus).toBeNull();
  });
});

describe("migration 0023 is pinned to config.ts", () => {
  const sql = readFileSync("supabase/migrations/0023_power_wheel_bonus.sql", "utf8");
  it("table, unlock level and odds", () => {
    const table = sql.match(/function public\.power_multiplier_bp_bonus[\s\S]*?array\[([\d,\s]+)\]/)![1].split(",").map(Number);
    expect(table).toEqual(Array.from({ length: MAX_LEVEL }, (_, i) => baseMultiplierBp(i + 1, 2)));
    expect(sql).toContain(`power_bonus_unlock_level()\nreturns integer language sql immutable set search_path = '' as $$ select ${BONUS_UNLOCK_LEVEL}; $$;`);
    let from = 0;
    for (const o of BONUS_ODDS) expect(sql).toContain(`when p_roll < ${(from += o.rolls)} then ${o.bonus}`);
    expect(sql).toContain(`p_roll > ${BONUS_ROLLS - 1} then null`);
    expect(DANGER).toHaveLength(MAX_LEVEL);
  });
  it("keeps the old rules in the old functions and only service_role may call anything", () => {
    for (const name of ["power_start_bonus", "power_spin_bonus", "power_spin", "power_stop"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
    }
    expect(sql).toContain("public.power_payout(v_r.bet, v_r.level)");
    expect(sql).not.toContain("wallet_ledger_reason_check");
  });
});
