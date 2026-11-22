import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { BETS, EDGE_BP, MAX_PAYOUT, maxSafe, multiplierBp, payoutFor, popcount, reachesCap, reachProbability, strategyReturn } from "./config";
import { drawMineMask } from "./draw";
import { cashout, emptyState, open, start, type ModelState } from "./model";

function seeded(seed = 0x9e3779b9) {
  let t = seed;
  return (n: number) => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
}

describe("multipliers", () => {
  it("exact integer table at a 10% house edge", () => {
    expect(EDGE_BP).toBe(1000);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((k) => multiplierBp(1, k))).toEqual([10125, 11571, 13500, 16200, 20250, 27000, 40500, 81000]);
    expect([1, 2, 3, 4, 5, 6, 7].map((k) => multiplierBp(2, k))).toEqual([11571, 15428, 21600, 32400, 54000, 108000, 324000]);
    expect([1, 2, 3, 4, 5, 6].map((k) => multiplierBp(3, k))).toEqual([13500, 21600, 37800, 75600, 189000, 756000]);
  });
  it("is null outside the playable range, and rises with every safe chest", () => {
    expect(multiplierBp(1, 0)).toBeNull();
    expect(multiplierBp(1, 9)).toBeNull();
    expect(multiplierBp(4, 1)).toBeNull();
    for (const m of [1, 2, 3]) for (let k = 2; k <= maxSafe(m); k++) expect(multiplierBp(m, k)!).toBeGreaterThan(multiplierBp(m, k - 1)!);
  });
  it("the table in the SQL migration is the same as the TypeScript one (kept in sync by this test)", () => {
    const sql = readFileSync("supabase/migrations/0020_mystic_chests.sql", "utf8");
    for (const m of [1, 2, 3]) {
      const row = new RegExp(`when ${m} then \\(array\\[([0-9, ]+)\\]\\)\\[p_k\\]`).exec(sql);
      expect(row, `row for ${m} mines`).not.toBeNull();
      expect(row![1].split(",").map((v) => Number(v.trim()))).toEqual(Array.from({ length: maxSafe(m) }, (_, i) => multiplierBp(m, i + 1)));
    }
    expect(sql).toContain(`select ${MAX_PAYOUT};`);
    // least() ignores NULL: an impossible k must pay 0, never the cap
    expect(sql).toMatch(/when public\.mystic_multiplier_bp\(p_mines, p_k\) is null then 0/);
    expect(sql).toContain(`bet in (${BETS.join(", ")})`);
  });
});

describe("payout and cap", () => {
  it("floor(bet × multiplier), never above the cap, never below the bet", () => {
    expect(payoutFor(10, 1, 1)).toBe(10); // ×1.0125 floors to the bet itself
    expect(payoutFor(100, 3, 4)).toBe(756);
    expect(payoutFor(50, 2, 5)).toBe(270);
    for (const bet of BETS) for (const m of [1, 2, 3]) for (let k = 1; k <= maxSafe(m); k++) {
      expect(payoutFor(bet, m, k)).toBeGreaterThanOrEqual(bet);
      expect(payoutFor(bet, m, k)).toBeLessThanOrEqual(MAX_PAYOUT);
    }
  });
  it("only the bet-100 / 3-cursed full clear reaches the 5,000 cap (7,560 → 5,000)", () => {
    expect(payoutFor(100, 3, 6)).toBe(MAX_PAYOUT);
    expect(reachesCap(100, 3, 6)).toBe(true);
    const capped = BETS.flatMap((b) => [1, 2, 3].flatMap((m) => Array.from({ length: maxSafe(m) }, (_, i) => [b, m, i + 1] as const))).filter(([b, m, k]) => reachesCap(b, m, k));
    expect(capped).toEqual([[100, 3, 6]]);
  });
});

describe("expected return (analytic, every stopping strategy)", () => {
  it("is ~90% (house edge 10%): rounding costs at most ~5 points on small bets, none beyond the floor on big ones", () => {
    for (const bet of BETS) for (const m of [1, 2, 3]) for (let k = 1; k <= maxSafe(m); k++) {
      if (reachesCap(bet, m, k)) continue; // the capped path is tested separately
      const r = strategyReturn(bet, m, k);
      expect(r).toBeLessThanOrEqual(0.9 + 1e-9); // the player never beats the edge
      expect(r).toBeGreaterThan(bet >= 50 ? 0.88 : 0.84);
    }
  });
  it("the cap lowers the return of exactly that one path (about 60%)", () => {
    expect(strategyReturn(100, 3, 6)).toBeCloseTo(reachProbability(3, 6) * 50, 6);
    expect(strategyReturn(100, 3, 6)).toBeLessThan(0.62);
  });
  it("1,000,000 simulated rounds: 'always cash out after 3 safe chests' returns ~90%", () => {
    const rand = seeded();
    const N = 1_000_000;
    let paid = 0;
    for (let i = 0; i < N; i++) {
      let st: ModelState = emptyState({ p: 100 });
      const mask = drawMineMask(2, rand);
      const s = start(st, "p", 10, 2, mask);
      if (!s.ok) throw new Error("setup");
      st = s.state;
      // open the first three tiles not chosen by the RNG order 0,1,2 (positions are random anyway)
      let alive = true;
      for (const tile of [0, 1, 2]) {
        const o = open(st, "p", 1, tile);
        if (!o.ok) throw new Error(o.error);
        st = o.state;
        if (o.round.status === "lost") { alive = false; break; }
      }
      if (alive) {
        const c = cashout(st, "p", 1);
        if (!c.ok) throw new Error(c.error);
        paid += c.round.payout;
      }
    }
    const rtp = paid / (N * 10);
    expect(rtp).toBeGreaterThan(0.86);
    expect(rtp).toBeLessThan(0.9 + 0.005);
  });
});

describe("drawMineMask", () => {
  it("always places exactly the requested number of distinct chests", () => {
    const rand = seeded(7);
    for (const m of [1, 2, 3]) for (let i = 0; i < 2000; i++) {
      const mask = drawMineMask(m, rand);
      expect(popcount(mask)).toBe(m);
      expect(mask).toBeLessThan(512);
    }
  });
  it("is uniform over the 9 chests", () => {
    const N = 90_000;
    const rand2 = seeded(13);
    const h2 = Array(9).fill(0);
    for (let i = 0; i < N; i++) {
      const mask = drawMineMask(2, rand2);
      for (let t = 0; t < 9; t++) if ((mask >> t) & 1) h2[t]++;
    }
    for (const c of h2) expect(Math.abs(c / N - 2 / 9)).toBeLessThan(0.01);
  });
});

describe("round rules (reference model of mystic_start / mystic_open / mystic_cashout)", () => {
  const MASK = 0b000000011; // chests 0 and 1 are cursed
  const begin = (bal = 500, bet = 100, mines = 2, mask = MASK) => {
    const r = start(emptyState({ p: bal }), "p", bet, mines, mask);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };

  it("start charges the bet and logs 'mystic_bet'; nothing else moves", () => {
    const st = begin();
    expect(st.balances.p).toBe(400);
    expect(st.ledger).toEqual([{ user: "p", reason: "mystic_bet", coins: -100, round: 1 }]);
  });
  it("validates bet, number of cursed chests and the mask", () => {
    const s0 = emptyState({ p: 500 });
    expect(start(s0, "p", 30, 2, MASK)).toEqual({ ok: false, error: "INVALID_BET" });
    expect(start(s0, "p", 10, 4, 0b1111)).toEqual({ ok: false, error: "INVALID_MINES" });
    expect(start(s0, "p", 10, 2, 0b111)).toEqual({ ok: false, error: "INVALID_MINES" }); // mask has 3 bits
    expect(start(s0, "p", 10, 2, 600)).toEqual({ ok: false, error: "INVALID_MINES" });
  });
  it("not enough coins: refused, nothing charged", () => {
    expect(start(emptyState({ p: 99 }), "p", 100, 2, MASK)).toEqual({ ok: false, error: "INSUFFICIENT_COINS" });
  });
  it("one active round per player: a second start (double tap, 2nd tab) is refused and not charged", () => {
    const st = begin();
    expect(start(st, "p", 10, 1, 1)).toEqual({ ok: false, error: "ACTIVE_ROUND_EXISTS" });
    expect(st.balances.p).toBe(400);
  });
  it("a cursed chest ends the round: bet lost, no payout, no 'mystic_win' row", () => {
    const o = open(begin(), "p", 1, 1);
    expect(o.ok && o.round.status).toBe("lost");
    if (o.ok) {
      expect(o.state.balances.p).toBe(400);
      expect(o.state.ledger.some((l) => l.reason === "mystic_win")).toBe(false);
      expect(open(o.state, "p", 1, 5)).toEqual({ ok: false, error: "ROUND_NOT_ACTIVE" });
    }
  });
  it("safe chests raise the payout; cash out pays once and logs 'mystic_win'", () => {
    let st = begin();
    for (const t of [2, 3, 4]) {
      const o = open(st, "p", 1, t);
      if (!o.ok) throw new Error(o.error);
      st = o.state;
    }
    const c = cashout(st, "p", 1);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.round.payout).toBe(payoutFor(100, 2, 3)); // ×2.16 = 216
    expect(c.state.balances.p).toBe(400 + 216);
    expect(c.state.ledger.at(-1)).toEqual({ user: "p", reason: "mystic_win", coins: 216, round: 1 });
    expect(cashout(c.state, "p", 1)).toEqual({ ok: false, error: "ROUND_NOT_ACTIVE" }); // double tap: no second payout
  });
  it("cash out needs at least one safe chest", () => {
    expect(cashout(begin(), "p", 1)).toEqual({ ok: false, error: "NO_SAFE_TILE" });
  });
  it("the same chest cannot be opened twice, tiles are 0-8, and rounds belong to their owner", () => {
    const st = begin();
    const o = open(st, "p", 1, 2);
    if (!o.ok) throw new Error("setup");
    expect(open(o.state, "p", 1, 2)).toEqual({ ok: false, error: "TILE_ALREADY_OPENED" });
    expect(open(st, "p", 1, 9)).toEqual({ ok: false, error: "INVALID_TILE" });
    expect(open(st, "other", 1, 2)).toEqual({ ok: false, error: "ROUND_NOT_FOUND" });
    expect(cashout(st, "other", 1)).toEqual({ ok: false, error: "ROUND_NOT_FOUND" });
  });
  it("opening every safe chest pays out automatically", () => {
    let st = begin(1000, 50, 2, MASK);
    let last;
    for (const t of [2, 3, 4, 5, 6, 7, 8]) {
      last = open(st, "p", 1, t);
      if (!last.ok) throw new Error(last.error);
      st = last.state;
    }
    expect(last?.ok && last.round.status).toBe("cleared");
    expect(last?.ok && last.auto).toBe("all_open");
    expect(st.balances.p).toBe(950 + payoutFor(50, 2, 7));
  });
  it("reaching the cap pays out the capped amount automatically (bet 100, 3 cursed, all 6 safe)", () => {
    let st = begin(1000, 100, 3, 0b000000111);
    let last;
    for (const t of [3, 4, 5, 6, 7, 8]) {
      last = open(st, "p", 1, t);
      if (!last.ok) throw new Error(last.error);
      st = last.state;
    }
    expect(last?.ok && last.round.payout).toBe(MAX_PAYOUT);
    expect(st.balances.p).toBe(900 + MAX_PAYOUT);
    expect(st.ledger.filter((l) => l.reason === "mystic_win")).toHaveLength(1);
  });
  it("ledger only ever holds the two mystic reasons: bets − wins = the player's net change", () => {
    let st = begin(500, 20, 1, 0b100000000);
    const o = open(st, "p", 1, 0);
    if (!o.ok) throw new Error("setup");
    const c = cashout(o.state, "p", 1);
    if (!c.ok) throw new Error("setup");
    st = c.state;
    expect(new Set(st.ledger.map((l) => l.reason))).toEqual(new Set(["mystic_bet", "mystic_win"]));
    expect(st.ledger.reduce((s, l) => s + l.coins, 0)).toBe(st.balances.p - 500);
  });
});
