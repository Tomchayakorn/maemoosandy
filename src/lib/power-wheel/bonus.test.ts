import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BETS, BONUS_ROLLS, BONUS_RULES, BONUS_UNLOCK_LEVEL, DANGER, LATEST_BONUS_VERSION, MAX_LEVEL, MAX_PAYOUT, SLICES, baseMultiplierBp, bonusForRoll, dangerSlices,
  isDangerSlice, multiplierBp, payoutFor, roundPayout, roundReachesCap, safeProbability, type Bonus, type BonusVersion,
} from "./config";
import { newState, spin, spinBonus, start, startBonus, stop } from "./model";
import { toRoundView } from "./types";

const BONUSES: Bonus[] = [1, 2, 5, 8];
const VERSIONS: BonusVersion[] = [2, 3];
const chance = (v: BonusVersion, b: Bonus) => (b === 1 ? BONUS_RULES[v].noBonusRolls : BONUS_RULES[v].odds.find((o) => o.bonus === b)!.rolls) / BONUS_ROLLS;

/** Exact expected return of a bonus round: `choose` decides at every level whether to go on (it may look at the multiplier). */
function expectedReturn(v: BonusVersion, bet: number, target: number | "best"): number {
  const value = (k: number, bonus: Bonus | null): number => {
    const paid = roundPayout(bet, k, v, bonus);
    if (k === MAX_LEVEL || roundReachesCap(bet, k, v, bonus)) return paid;
    const next = k + 1;
    const afterSafe = next === BONUS_UNLOCK_LEVEL ? BONUSES.reduce((a, b) => a + chance(v, b) * value(next, b), 0) : value(next, bonus);
    const on = safeProbability(next) * afterSafe;
    if (target === "best") return Math.max(paid, on);
    return k >= target ? paid : on;
  };
  return (safeProbability(1) * value(1, null)) / bet;
}

const TABLES: Record<BonusVersion, number[]> = {
  2: [10000, 11111, 12422, 15528, 22183, 31691, 52818, 88031, 176062, 352125, 880313, 2200782],
  3: [10000, 11111, 12400, 15500, 22144, 31634, 52724, 87874, 175748, 351496, 878741, 2196852],
};

describe("power wheel bonus", () => {
  const counts = (v: BonusVersion) => {
    const seen = { 1: 0, 2: 0, 5: 0, 8: 0 };
    for (let roll = 0; roll < BONUS_ROLLS; roll++) seen[bonusForRoll(roll, v)!]++;
    return seen;
  };

  it("new rounds draw x2, x5 and x8 equally (1% each)", () => {
    expect(LATEST_BONUS_VERSION).toBe(3);
    expect(counts(3)).toEqual({ 1: 970, 2: 10, 5: 10, 8: 10 });
    expect(new Set(BONUS_RULES[3].odds.map((o) => o.rolls)).size).toBe(1);
    expect(BONUS_RULES[3].average1000).toBe(1120);
    expect([bonusForRoll(0), bonusForRoll(10), bonusForRoll(20), bonusForRoll(30)]).toEqual([8, 5, 2, 1]);
    for (const bad of [-1, 1000, 1.5, NaN]) expect(bonusForRoll(bad)).toBeNull();
  });

  it("keeps the odds of rounds that started under version 2", () => {
    expect(counts(2)).toEqual({ 1: 936, 2: 50, 5: 10, 8: 4 });
    expect(BONUS_RULES[2].average1000).toBe(1118);
  });

  it("keeps levels 1-2, divides the table by the average bonus from level 3, and still pays more on every level", () => {
    for (const v of VERSIONS) {
      expect(Array.from({ length: MAX_LEVEL }, (_, i) => baseMultiplierBp(i + 1, v))).toEqual(TABLES[v]);
      for (let k = 1; k <= MAX_LEVEL; k++) {
        expect(baseMultiplierBp(k, 1)).toBe(multiplierBp(k));
        if (k < BONUS_UNLOCK_LEVEL) expect(baseMultiplierBp(k, v)).toBe(multiplierBp(k));
        if (k > 1) expect(baseMultiplierBp(k, v)!).toBeGreaterThan(baseMultiplierBp(k - 1, v)!);
      }
      expect(roundPayout(100, 2, v, null)).toBe(111);
      expect(baseMultiplierBp(13, v)).toBeNull();
    }
    expect(BONUSES.map((b) => roundPayout(100, 3, 3, b))).toEqual([124, 248, 620, 992]);
    expect(BONUSES.map((b) => roundPayout(100, 3, 2, b))).toEqual([124, 248, 621, 993]);
    expect(roundPayout(100, 3, 1, 8)).toBe(payoutFor(100, 3)); // an original round ignores any bonus
  });

  it("never pays above the cap; a bigger bonus reaches it sooner", () => {
    for (const v of VERSIONS) {
      for (const bet of BETS) for (let k = 1; k <= MAX_LEVEL; k++) for (const b of BONUSES) expect(roundPayout(bet, k, v, b)).toBeLessThanOrEqual(MAX_PAYOUT);
      const first = (b: Bonus) => Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).find((k) => roundReachesCap(100, k, v, b));
      expect(BONUSES.map(first)).toEqual([10, 9, 8, 7]);
      // nothing can reach the cap on the unlock level itself
      expect(roundReachesCap(100, BONUS_UNLOCK_LEVEL, v, 8)).toBe(false);
    }
  });

  it("no way of playing returns more than 90% (the house edge is unchanged)", () => {
    for (const v of VERSIONS) {
      for (const bet of BETS) {
        const best = expectedReturn(v, bet, "best");
        expect(best).toBeLessThanOrEqual(0.9 + 1e-9);
        expect(best).toBeGreaterThan(0.899);
        for (let k = 1; k <= MAX_LEVEL; k++) expect(expectedReturn(v, bet, k)).toBeLessThanOrEqual(0.9 + 1e-9);
      }
      // below the levels where the cap bites (x8 reaches it at level 7), every stopping level stays close to 90% on a 100 bet
      for (let k = 1; k <= 6; k++) expect(expectedReturn(v, 100, k)).toBeGreaterThan(0.89);
    }
  });
});

describe("power wheel bonus rules (reference model)", () => {
  const safe = (level: number) => [...Array(SLICES).keys()].find((s) => !isDangerSlice(level, s))!;

  it("unlocks once on the unlock level and pays once with the bonus", () => {
    const s = newState(500);
    const r = startBonus(s, 100);
    expect(r.version).toBe(3);
    expect(spinBonus(s, r.id, safe(1), 0).unlocked).toBe(false);
    expect(spinBonus(s, r.id, safe(2), 0).round.bonus).toBeUndefined();
    expect(spinBonus(s, r.id, safe(3), 10).unlocked).toBe(true);
    expect([r.bonus, r.payout]).toEqual([5, 620]);
    expect(spinBonus(s, r.id, safe(4), 0).unlocked).toBe(false);
    expect([r.bonus, r.payout]).toEqual([5, 775]);
    stop(s, r.id);
    expect(s.balance).toBe(400 + 775);
    expect(() => spinBonus(s, r.id, 1, 0)).toThrow("ROUND_NOT_ACTIVE");
    expect(s.balance).toBe(500 + s.ledger.reduce((a, l) => a + l.delta, 0));
  });

  it("gives each round the odds and table of its own version", () => {
    const s = newState(1000);
    const old = startBonus(s, 100, 2);
    for (let k = 1; k <= 3; k++) spinBonus(s, old.id, safe(k), 14);
    expect([old.bonus, old.payout]).toEqual([2, 248]); // roll 14 is x2 in version 2 …
    stop(s, old.id);
    const now = startBonus(s, 100);
    for (let k = 1; k <= 3; k++) spinBonus(s, now.id, safe(k), 14);
    expect([now.bonus, now.payout]).toEqual([5, 620]); // … and x5 in version 3
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

  it("leaves original rounds exactly as before and refuses bad input", () => {
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

  it("reads responses of every version", () => {
    const raw = { round_id: "a", status: "active" as const, bet: 10, level: 3, payout: 13, balance: 1 };
    expect(toRoundView(raw)).toMatchObject({ version: 1, bonus: null, unlocked: false });
    expect(toRoundView({ ...raw, bonus_version: 2, bonus: 8, unlocked: true })).toMatchObject({ version: 2, bonus: 8, unlocked: true });
    expect(toRoundView({ ...raw, bonus_version: 3, bonus: 5 })).toMatchObject({ version: 3, bonus: 5 });
    expect(toRoundView({ ...raw, bonus_version: 3, bonus: 3 }).bonus).toBeNull();
  });
});

describe("the migrations are pinned to config.ts", () => {
  const read = (f: string) => readFileSync(`supabase/migrations/${f}`, "utf8");
  const files: Record<BonusVersion, { sql: string; table: string; roll: string }> = {
    2: { sql: read("0023_power_wheel_bonus.sql"), table: "power_multiplier_bp_bonus", roll: "power_bonus_for_roll" },
    3: { sql: read("0024_power_wheel_equal_bonus.sql"), table: "power_multiplier_bp_v3", roll: "power_bonus_for_roll_v3" },
  };
  it("tables and odds of both versions, and the unlock level", () => {
    for (const v of VERSIONS) {
      const { sql, table, roll } = files[v];
      const numbers = sql.match(new RegExp(`function public\\.${table}\\([\\s\\S]*?array\\[([\\d,\\s]+)\\]`))![1].split(",").map(Number);
      expect(numbers).toEqual(Array.from({ length: MAX_LEVEL }, (_, i) => baseMultiplierBp(i + 1, v)));
      const body = sql.slice(sql.indexOf(`function public.${roll}(`)).split("$$;")[0];
      let from = 0;
      for (const o of BONUS_RULES[v].odds) expect(body).toContain(`when p_roll < ${(from += o.rolls)} then ${o.bonus}`);
      expect(body).toContain(`p_roll > ${BONUS_ROLLS - 1} then null`);
    }
    expect(files[2].sql).toContain(`power_bonus_unlock_level()\nreturns integer language sql immutable set search_path = '' as $$ select ${BONUS_UNLOCK_LEVEL}; $$;`);
    expect(DANGER).toHaveLength(MAX_LEVEL);
  });
  it("keeps the original rules, leaves version 2 starts alone, and only service_role may call anything", () => {
    for (const name of ["power_start_bonus_v3", "power_spin_bonus", "power_spin", "power_stop", "power_bonus_for_roll_v3"]) {
      expect(files[3].sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
    }
    expect(files[3].sql).not.toContain("function public.power_start_bonus(");
    expect(files[3].sql).not.toContain("function public.power_bonus_for_roll(");
    expect(files[3].sql).not.toContain("wallet_ledger_reason_check");
    expect(files[3].sql).toContain("public.power_multiplier_bp(p_k)");
  });
});
