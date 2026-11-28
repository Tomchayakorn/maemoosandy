import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BETS, BONUS_AVERAGE_1000, BONUS_ODDS, BONUS_ROLLS, BONUS_UNLOCK_SAFE, MAX_PAYOUT, NO_BONUS_ROLLS, TILES, baseMultiplierBp, bonusForRoll, maxSafe, multiplierBp,
  payoutFor, roundPayout, roundReachesCap, type Bonus,
} from "./config";
import { drawBonusRoll } from "./draw";
import { cashout, emptyState, open, openBonus, start, startBonus, type ModelResult } from "./model";
import { toRoundView } from "./types";

const BONUSES: Bonus[] = [1, 2, 5, 8];
const MINES = [1, 2, 3];
const chance = (b: Bonus) => (b === 1 ? NO_BONUS_ROLLS : BONUS_ODDS.find((o) => o.bonus === b)!.rolls) / BONUS_ROLLS;
const ok = (r: ModelResult) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

/** Exact expected return: `target` = cash out after that many safe chests, "best" = the best choice at every step (it may look at the bonus). */
function expectedReturn(version: 1 | 2, bet: number, mines: number, target: number | "best"): number {
  const value = (k: number, bonus: Bonus | null): number => {
    const paid = roundPayout(bet, mines, k, version, bonus);
    if (k === maxSafe(mines) || roundReachesCap(bet, mines, k, version, bonus)) return paid;
    const safe = (TILES - mines - k) / (TILES - k);
    const next = k + 1;
    const after = version === 2 && next === BONUS_UNLOCK_SAFE ? BONUSES.reduce((a, b) => a + chance(b) * value(next, b), 0) : value(next, bonus);
    const on = safe * after;
    if (target === "best") return Math.max(paid, on);
    return k >= target ? paid : on;
  };
  return (((TILES - mines) / TILES) * value(1, null)) / bet;
}

describe("chest bonus", () => {
  it("draws x2, x5 and x8 equally, 1% each", () => {
    const seen = { 1: 0, 2: 0, 5: 0, 8: 0 };
    for (let roll = 0; roll < BONUS_ROLLS; roll++) seen[bonusForRoll(roll)!]++;
    expect(seen).toEqual({ 1: 970, 2: 10, 5: 10, 8: 10 });
    expect(BONUS_AVERAGE_1000).toBe(1120);
    for (const bad of [-1, 1000, 2.5, NaN]) expect(bonusForRoll(bad)).toBeNull();
    for (let i = 0; i < 200; i++) expect(bonusForRoll(drawBonusRoll())).not.toBeNull();
    expect(drawBonusRoll(() => 7)).toBe(7);
  });

  it("keeps chests 1-2, divides the table by 1.12 from the 3rd, and every safe chest still pays more", () => {
    expect(MINES.map((m) => Array.from({ length: maxSafe(m) }, (_, i) => baseMultiplierBp(m, i + 1, 2)))).toEqual([
      [10125, 11571, 12053, 14464, 18080, 24107, 36160, 72321],
      [11571, 15428, 19285, 28928, 48214, 96428, 289285],
      [13500, 21600, 33750, 67500, 168750, 675000],
    ]);
    for (const m of MINES) {
      for (let k = 1; k <= maxSafe(m); k++) {
        expect(baseMultiplierBp(m, k, 1)).toBe(multiplierBp(m, k));
        if (k < BONUS_UNLOCK_SAFE) expect(baseMultiplierBp(m, k, 2)).toBe(multiplierBp(m, k));
        if (k > 1) expect(baseMultiplierBp(m, k, 2)!).toBeGreaterThan(baseMultiplierBp(m, k - 1, 2)!);
        for (const bet of BETS) if (k > 1 && !roundReachesCap(bet, m, k - 1, 2, 1)) expect(roundPayout(bet, m, k, 2, 1)).toBeGreaterThan(roundPayout(bet, m, k - 1, 2, 1));
      }
      expect(baseMultiplierBp(m, maxSafe(m) + 1, 2)).toBeNull();
    }
    expect(BONUSES.map((b) => roundPayout(100, 1, 3, 2, b))).toEqual([120, 241, 602, 964]);
    expect(roundPayout(100, 3, 3, 1, 8)).toBe(payoutFor(100, 3, 3)); // an old round ignores any bonus
  });

  it("never pays above the cap, and nothing reaches it on the unlock chest itself", () => {
    for (const bet of BETS) for (const m of MINES) {
      for (let k = 1; k <= maxSafe(m); k++) for (const b of BONUSES) expect(roundPayout(bet, m, k, 2, b)).toBeLessThanOrEqual(MAX_PAYOUT);
      expect(roundReachesCap(bet, m, BONUS_UNLOCK_SAFE, 2, 8)).toBe(false);
    }
    expect(roundPayout(100, 3, 4, 2, 8)).toBe(MAX_PAYOUT);
  });

  it("no way of playing returns more than 90%, and never more than the original game", () => {
    for (const bet of BETS) for (const m of MINES) {
      const best = expectedReturn(2, bet, m, "best");
      expect(best).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(best).toBeLessThanOrEqual(expectedReturn(1, bet, m, "best") + 1e-9);
      expect(best).toBeGreaterThan(0.895);
      for (let k = 1; k <= maxSafe(m); k++) expect(expectedReturn(2, bet, m, k)).toBeLessThanOrEqual(0.9 + 1e-9);
    }
  });
});

describe("chest bonus rules (reference model)", () => {
  const begin = (bet = 100, mines = 1, mask = 1) => ok(startBonus(emptyState({ p: 1000 }), "p", bet, mines, mask));

  it("unlocks once on the 3rd safe chest and pays once with the bonus", () => {
    let s = begin().state;
    expect(ok(openBonus(s, "p", 1, 1, 0)).unlocked).toBe(false);
    s = ok(openBonus(s, "p", 1, 1, 0)).state;
    const second = ok(openBonus(s, "p", 1, 2, 0));
    expect([second.round.bonus, second.round.payout]).toEqual([undefined, 115]);
    const third = ok(openBonus(second.state, "p", 1, 3, 15));
    expect([third.unlocked, third.round.bonus, third.round.payout]).toEqual([true, 5, 602]);
    const fourth = ok(openBonus(third.state, "p", 1, 4, 0));
    expect([fourth.unlocked, fourth.round.bonus, fourth.round.payout]).toEqual([false, 5, 723]);
    const done = ok(cashout(fourth.state, "p", 1));
    expect(done.state.balances.p).toBe(900 + 723);
    expect(cashout(done.state, "p", 1)).toEqual({ ok: false, error: "ROUND_NOT_ACTIVE" });
    expect(done.state.balances.p).toBe(1000 + done.state.ledger.reduce((a, l) => a + l.coins, 0));
  });

  it("pays the base table without a bonus, and loses the bet on a cursed chest even with x8", () => {
    let s = begin().state;
    for (const t of [1, 2, 3]) s = ok(openBonus(s, "p", 1, t, 999)).state;
    expect(s.rounds[0]).toMatchObject({ bonus: 1, payout: 120 });
    let l = begin().state;
    for (const t of [1, 2, 3]) l = ok(openBonus(l, "p", 1, t, 0)).state;
    const hit = ok(openBonus(l, "p", 1, 0, 0));
    expect([hit.round.status, hit.round.payout, hit.state.balances.p]).toEqual(["lost", 0, 900]);
  });

  it("pays the cap and a cleared board by itself", () => {
    let s = begin(100, 3, 7).state;
    for (const t of [3, 4, 5]) s = ok(openBonus(s, "p", 1, t, 0)).state;
    const capped = ok(openBonus(s, "p", 1, 6, 0));
    expect([capped.auto, capped.round.payout, capped.state.balances.p]).toEqual(["cap", 5000, 900 + 5000]);
    let a = begin(10, 3, 7).state;
    let last!: ReturnType<typeof ok>;
    for (const t of [3, 4, 5, 6, 7, 8]) a = (last = ok(openBonus(a, "p", 1, t, 999))).state;
    expect([last.auto, last.round.payout]).toEqual(["all_open", 675]);
  });

  it("lets a round that is already running finish under the original rules", () => {
    let s = ok(start(emptyState({ p: 1000 }), "p", 100, 2, 3)).state;
    s = ok(open(s, "p", 1, 2)).state; // opened before the new rules arrived
    for (const t of [3, 4]) s = ok(openBonus(s, "p", 1, t, 0)).state;
    expect(s.rounds[0]).toMatchObject({ safeCount: 3, payout: 216 });
    expect(s.rounds[0].bonus).toBeUndefined();
    expect(ok(cashout(s, "p", 1)).state.balances.p).toBe(900 + 216);
    expect(startBonus(s, "p", 10, 1, 1)).toEqual({ ok: false, error: "ACTIVE_ROUND_EXISTS" });
  });

  it("refuses bad input", () => {
    const s = begin().state;
    expect(openBonus(s, "p", 1, 9, 0)).toEqual({ ok: false, error: "INVALID_TILE" });
    expect(openBonus(s, "p", 1, 1, 1000)).toEqual({ ok: false, error: "INVALID_REWARD" });
    expect(openBonus(s, "other", 1, 1, 0)).toEqual({ ok: false, error: "ROUND_NOT_FOUND" });
  });

  it("reads responses from before and after migration 0025, and never passes the cursed chests of an active round", () => {
    const raw = { round_id: "a", status: "active" as const, bet: 10, mines: 1, opened_mask: 0, safe_count: 0, payout: 0, mine_mask: 5, balance: 1 };
    expect(toRoundView(raw)).toMatchObject({ version: 1, bonus: null, unlocked: false, mineMask: null });
    expect(toRoundView({ ...raw, bonus_version: 2, bonus: 8, unlocked: true })).toMatchObject({ version: 2, bonus: 8, unlocked: true, mineMask: null });
    expect(toRoundView({ ...raw, bonus_version: 2, bonus: 3 }).bonus).toBeNull();
  });
});

describe("migration 0025 is pinned to config.ts", () => {
  const sql = readFileSync("supabase/migrations/0025_mystic_bonus.sql", "utf8");
  it("table, unlock chest and odds", () => {
    const body = sql.slice(sql.indexOf("function public.mystic_multiplier_bp_bonus(")).split("$$;")[0];
    for (const m of MINES) {
      const row = new RegExp(`when ${m} then \\(array\\[([0-9, ]+)\\]\\)\\[p_k\\]`).exec(body)![1].split(",").map(Number);
      expect(row).toEqual(Array.from({ length: maxSafe(m) }, (_, i) => baseMultiplierBp(m, i + 1, 2)));
    }
    expect(sql).toContain(`mystic_bonus_unlock_count()\nreturns integer language sql immutable set search_path = '' as $$ select ${BONUS_UNLOCK_SAFE}; $$;`);
    const roll = sql.slice(sql.indexOf("function public.mystic_bonus_for_roll(")).split("$$;")[0];
    let from = 0;
    for (const o of BONUS_ODDS) expect(roll).toContain(`when p_roll < ${(from += o.rolls)} then ${o.bonus}`);
    expect(roll).toContain(`p_roll > ${BONUS_ROLLS - 1} then null`);
  });
  it("keeps the old rules, adds no ledger reason, and only service_role may call anything", () => {
    for (const name of ["mystic_start_bonus", "mystic_open_bonus", "mystic_open", "mystic_cashout", "mystic_bonus_for_roll"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
    }
    expect(sql).not.toContain("function public.mystic_start(");
    expect(sql).not.toContain("wallet_ledger_reason_check");
    expect(sql).toContain("public.mystic_payout(p_bet, p_mines, p_k)");
  });
});
