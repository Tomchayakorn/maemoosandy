import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BETS, DANGER, DANGER_ORDER, EDGE_BP, MAX_LEVEL, MAX_PAYOUT, SLICES, dangerSlices, isDangerSlice, multiplierBp, payoutFor,
  reachProbability, reachesCap, safeProbability, strategyReturn,
} from "./config";
import { ModelError, newState, spin, start, stop } from "./model";

describe("power wheel math", () => {
  it("has 12 levels, never a fully dangerous wheel, and danger slices grow with the level", () => {
    expect(MAX_LEVEL).toBe(12);
    expect(DANGER.every((d) => d >= 1 && d < SLICES)).toBe(true);
    for (let k = 2; k <= MAX_LEVEL; k++) expect(DANGER[k - 1]).toBeGreaterThanOrEqual(DANGER[k - 2]);
    expect([...DANGER_ORDER].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let k = 1; k <= MAX_LEVEL; k++) {
      expect(dangerSlices(k)).toHaveLength(DANGER[k - 1]);
      expect(safeProbability(k)).toBeCloseTo((SLICES - DANGER[k - 1]) / SLICES, 12);
    }
    expect(dangerSlices(0)).toEqual([]);
  });

  it("matches the multiplier table", () => {
    const expected = [10000, 11111, 13888, 17361, 24801, 35430, 59051, 98418, 196837, 393675, 984189, 2460474];
    expected.forEach((bp, i) => expect(multiplierBp(i + 1)).toBe(bp));
    expect(multiplierBp(0)).toBeNull();
    expect(multiplierBp(13)).toBeNull();
  });

  it("every stopping strategy returns ~90% before rounding and the cap (house edge 10%)", () => {
    for (let k = 1; k <= MAX_LEVEL; k++) {
      const uncapped = reachProbability(k) * (multiplierBp(k)! / 10_000);
      expect(uncapped).toBeGreaterThan(0.8999);
      expect(uncapped).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(EDGE_BP).toBe(1000);
    }
    // with a 100-coin bet there is no rounding loss below the cap: still ~90%
    for (let k = 1; k <= 8; k++) expect(strategyReturn(100, k)).toBeGreaterThan(0.89);
    for (const bet of BETS) for (let k = 1; k <= MAX_LEVEL; k++) expect(strategyReturn(bet, k)).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it("caps the payout at 3,000 and pays the capped round automatically", () => {
    for (const bet of BETS) for (let k = 1; k <= MAX_LEVEL; k++) expect(payoutFor(bet, k)).toBeLessThanOrEqual(MAX_PAYOUT);
    expect(MAX_PAYOUT).toBe(3000);
    expect(payoutFor(100, 9)).toBe(1968);
    expect(payoutFor(100, 10)).toBe(3000);
    expect(payoutFor(100, 11)).toBe(3000);
    expect(reachesCap(100, 9)).toBe(false);
    expect(reachesCap(100, 10)).toBe(true);
    expect(reachesCap(50, 10)).toBe(false);
    expect(reachesCap(50, 11)).toBe(true);
    expect(reachesCap(10, 12)).toBe(false);
  });

  it("level 1 returns the bet exactly (x1.00)", () => {
    for (const bet of BETS) expect(payoutFor(bet, 1)).toBe(bet);
  });
});

describe("power wheel rules (reference model)", () => {
  const safe = (level: number) => [...Array(SLICES).keys()].find((s) => !isDangerSlice(level, s))!;
  const danger = (level: number) => dangerSlices(level)[0];

  it("validates the bet, one active round, enough coins", () => {
    const s = newState(100);
    expect(() => start(s, 30)).toThrow("INVALID_BET");
    expect(() => start(newState(5), 10)).toThrow("INSUFFICIENT_COINS");
    start(s, 20);
    expect(() => start(s, 10)).toThrow("ACTIVE_ROUND_EXISTS");
    expect(s.balance).toBe(80);
  });

  it("cannot stop before clearing a level; stops once; closed rounds reject everything", () => {
    const s = newState(500);
    const r = start(s, 100);
    expect(() => stop(s, r.id)).toThrow("NO_LEVEL_CLEARED");
    spin(s, r.id, safe(1));
    spin(s, r.id, safe(2));
    expect(r.payout).toBe(111);
    stop(s, r.id);
    expect(s.balance).toBe(400 + 111);
    expect(() => stop(s, r.id)).toThrow("ROUND_NOT_ACTIVE");
    expect(() => spin(s, r.id, 0)).toThrow("ROUND_NOT_ACTIVE");
  });

  it("a danger slice ends the round with no payout", () => {
    const s = newState(200);
    const r = start(s, 50);
    spin(s, r.id, safe(1));
    const out = spin(s, r.id, danger(2));
    expect(out.failed).toBe(true);
    expect(r.status).toBe("lost");
    expect(s.balance).toBe(150);
    expect(s.ledger.some((l) => l.reason === "power_win")).toBe(false);
  });

  it("clearing the top level or reaching the cap pays automatically", () => {
    const s = newState(1000);
    const r = start(s, 100);
    for (let k = 1; k <= 9; k++) expect(spin(s, r.id, safe(k)).auto).toBeNull();
    const last = spin(s, r.id, safe(10));
    expect(last.auto).toBe("cap");
    expect(r.status).toBe("cleared");
    expect(r.payout).toBe(3000);
    expect(s.balance).toBe(900 + 3000);

    const s2 = newState(1000);
    const r2 = start(s2, 10);
    for (let k = 1; k <= 11; k++) spin(s2, r2.id, safe(k));
    expect(spin(s2, r2.id, safe(12)).auto).toBe("top");
    expect(s2.balance).toBe(990 + 2460);
  });

  it("rejects a bad slice and conserves coins (balance = start + ledger)", () => {
    const s = newState(300);
    const r = start(s, 20);
    expect(() => spin(s, r.id, 10)).toThrow(ModelError);
    spin(s, r.id, safe(1));
    stop(s, r.id);
    expect(s.balance).toBe(300 + s.ledger.reduce((a, l) => a + l.delta, 0));
  });

  it("simulation: random play with a random stopping level returns ~90% on a 100 bet (no cap noise)", () => {
    // seeded PRNG (mulberry32)
    let a = 12345;
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ROUNDS = 400_000;
    for (const target of [1, 3, 6]) {
      let paid = 0;
      for (let i = 0; i < ROUNDS; i++) {
        let level = 0;
        let alive = true;
        while (level < target) {
          if (isDangerSlice(level + 1, Math.floor(rnd() * SLICES))) { alive = false; break; }
          level++;
        }
        if (alive) paid += payoutFor(100, level);
      }
      const rtp = paid / (ROUNDS * 100);
      expect(rtp).toBeGreaterThan(0.88);
      expect(rtp).toBeLessThan(0.92);
    }
  });
});

describe("migration 0021 is pinned to config.ts", () => {
  const sql = readFileSync("supabase/migrations/0021_power_wheel.sql", "utf8");
  const arr = (re: RegExp) => {
    const m = sql.match(re);
    expect(m).not.toBeNull();
    return m![1].split(",").map((x) => Number(x.trim()));
  };
  it("multiplier table", () => {
    expect(arr(/function public\.power_multiplier_bp[\s\S]*?array\[([\d,\s]+)\]/)).toEqual(Array.from({ length: MAX_LEVEL }, (_, i) => multiplierBp(i + 1)));
  });
  it("danger counts and slice order", () => {
    expect(arr(/function public\.power_danger_count[\s\S]*?array\[([\d,\s]+)\]/)).toEqual([...DANGER]);
    expect(arr(/function public\.power_slice_is_danger[\s\S]*?array\[([\d,\s]+)\]/)).toEqual([...DANGER_ORDER]);
  });
  it("cap, edge-free constants and bets", () => {
    expect(sql).toContain(`select ${MAX_PAYOUT};`);
    expect(sql).toContain(`select ${MAX_LEVEL};`);
    expect(sql).toContain("p_bet not in (10, 20, 50, 100)");
  });
});
