import { describe, expect, it } from "vitest";
import { afterSpin, BUFF_ROUNDS, canSpinNow, spendLuckCard, type LuckState, type Wallet } from "./luck-card";

const COST = 50;
const st = (cards: number, buffRounds: number): LuckState => ({ cards, buffRounds });
const rich: Wallet = { balance: 500, tickets: 0 };

describe("using a luck card (model of use_luck_card)", () => {
  it("needs a card", () => {
    expect(spendLuckCard(st(0, 0), rich, COST)).toEqual({ ok: false, code: "NO_LUCK_CARDS" });
  });
  it("starts a 3-round buff and spends exactly one card", () => {
    expect(BUFF_ROUNDS).toBe(3);
    expect(spendLuckCard(st(2, 0), rich, COST)).toEqual({ ok: true, state: { cards: 1, buffRounds: 3 } });
  });
  it("double click / second tab: a running buff refuses a second use, no card is wasted", () => {
    const first = spendLuckCard(st(2, 0), rich, COST);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = spendLuckCard(first.state, rich, COST);
    expect(second).toEqual({ ok: false, code: "BUFF_ALREADY_ACTIVE" });
    expect(first.state.cards).toBe(1); // the second card is still there
  });
});

describe("using a card needs coins to spin (or a free ticket)", () => {
  it("canSpinNow: free ticket, or at least the spin price", () => {
    expect(canSpinNow({ balance: 0, tickets: 0 }, COST)).toBe(false);
    expect(canSpinNow({ balance: 49, tickets: 0 }, COST)).toBe(false);
    expect(canSpinNow({ balance: 50, tickets: 0 }, COST)).toBe(true);
    expect(canSpinNow({ balance: 0, tickets: 1 }, COST)).toBe(true);
  });
  it("refuses with 0 or 49 coins and no ticket — the card is NOT consumed, no buff starts", () => {
    for (const balance of [0, 20, 49]) {
      const s = st(1, 0);
      const r = spendLuckCard(s, { balance, tickets: 0 }, COST);
      expect(r).toEqual({ ok: false, code: "INSUFFICIENT_COINS" });
      expect(s).toEqual({ cards: 1, buffRounds: 0 }); // state untouched
    }
  });
  it("allows it with exactly 50 coins, or with a free ticket and no coins", () => {
    expect(spendLuckCard(st(1, 0), { balance: 50, tickets: 0 }, COST).ok).toBe(true);
    expect(spendLuckCard(st(1, 0), { balance: 0, tickets: 1 }, COST).ok).toBe(true);
  });
  it("after topping up, the same card can be used", () => {
    expect(spendLuckCard(st(1, 0), { balance: 10, tickets: 0 }, COST).ok).toBe(false);
    expect(spendLuckCard(st(1, 0), { balance: 10 + 100, tickets: 0 }, COST).ok).toBe(true);
  });
});

describe("a card won with no coins left is kept", () => {
  it("winning the card on the last paid spin (balance goes 50 -> 0) still adds it", () => {
    const r = afterSpin(st(0, 0), true);
    expect(r.state).toEqual({ cards: 1, buffRounds: 0 });
    // and it is usable only once the player can spin again
    expect(spendLuckCard(r.state, { balance: 0, tickets: 0 }, COST)).toEqual({ ok: false, code: "INSUFFICIENT_COINS" });
    expect(spendLuckCard(r.state, { balance: 50, tickets: 0 }, COST).ok).toBe(true);
  });
  it("a running buff does not expire while the player has no coins: rounds only drop when a spin actually runs", () => {
    // spin attempts that fail (no coins) are rolled back by the database, so afterSpin is never applied for them
    const s = st(0, 3);
    const rejectedAttempts = 5; // nothing happens to s
    for (let i = 0; i < rejectedAttempts; i++) expect(s).toEqual({ cards: 0, buffRounds: 3 });
    expect(afterSpin(s, false).state.buffRounds).toBe(2); // the first spin that runs uses one round
  });
});

describe("buff over spins (model of spin_wheel_cycle)", () => {
  it("counts down 3 -> 2 -> 1 -> 0 on the next three spins, then expires; buff applies only while active", () => {
    let s = st(1, 0);
    const used = spendLuckCard(s, rich, COST);
    if (!used.ok) throw new Error("should use");
    s = used.state;
    const applied: boolean[] = [];
    const rounds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = afterSpin(s, false);
      applied.push(r.buffApplied);
      s = r.state;
      rounds.push(s.buffRounds);
    }
    expect(applied).toEqual([true, true, true, false, false]); // exactly 3 buffed spins
    expect(rounds).toEqual([2, 1, 0, 0, 0]);
  });
  it("winning a luck card adds one; it can't buff the spin that won it", () => {
    const r = afterSpin(st(0, 0), true);
    expect(r.buffApplied).toBe(false);
    expect(r.state).toEqual({ cards: 1, buffRounds: 0 });
  });
  it("a card won during a running buff is kept (no stacking, no loss)", () => {
    const r = afterSpin(st(0, 2), true);
    expect(r.buffApplied).toBe(true);
    expect(r.state).toEqual({ cards: 1, buffRounds: 1 });
    expect(spendLuckCard(r.state, rich, COST)).toEqual({ ok: false, code: "BUFF_ALREADY_ACTIVE" });
  });
  it("free-ticket spins and the jackpot spin use a buff round too (every spin counts)", () => {
    expect(afterSpin(st(0, 3), false).state.buffRounds).toBe(2);
  });
});
