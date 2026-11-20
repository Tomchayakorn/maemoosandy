import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { WHEEL_SPIN_COST } from "../pricing";
import {
  buffedWeights,
  expectedReturnPerPaidSpin,
  isJackpotPaidSpin,
  JACKPOT_EVERY_PAID_SPINS,
  luckCardValueCoins,
  JACKPOT_SEGMENT_INDEX,
  pickStandardReward,
  resolveSpin,
  returnRatio,
  SEGMENT_WEIGHTS,
  segmentForRoll,
  TOTAL_WEIGHT,
} from "./rewards";
import { WHEEL_SEGMENTS } from "./segments";

/** Weight of each reward key, merging duplicate segments. */
function odds(): Record<string, number> {
  const out: Record<string, number> = {};
  WHEEL_SEGMENTS.forEach((s, i) => {
    const k = s.type === "none" ? "none" : `${s.type}:${s.value}`;
    out[k] = (out[k] ?? 0) + SEGMENT_WEIGHTS[i];
  });
  return out;
}

describe("wheel config", () => {
  it("has 8 segments, one weight each; ordinary weights total 10,000", () => {
    expect(WHEEL_SEGMENTS).toHaveLength(8);
    expect(SEGMENT_WEIGHTS).toHaveLength(8);
    expect(TOTAL_WEIGHT).toBe(10000);
  });

  it("matches the agreed ordinary odds, with the jackpot at weight 0", () => {
    expect(odds()).toEqual({
      none: 6730,
      "coins:25": 2300,
      "coins:50": 550,
      "luck_card:1": 150,
      "coins:150": 100,
      "coins:500": 20,
      "free_reading:1": 150,
      "coins:5000": 0,
    });
  });

  it("has unique segment keys and no equal neighbours (looks nicer)", () => {
    expect(new Set(WHEEL_SEGMENTS.map((s) => s.key)).size).toBe(8);
    WHEEL_SEGMENTS.forEach((s, i) => {
      const next = WHEEL_SEGMENTS[(i + 1) % 8];
      expect(`${s.type}${s.value}`).not.toBe(`${next.type}${next.value}`);
    });
  });

  it("finds the 5,000-coin jackpot segment and its weight is zero", () => {
    expect(WHEEL_SEGMENTS[JACKPOT_SEGMENT_INDEX]).toMatchObject({ key: "jackpot_5000", type: "coins", value: 5000 });
    expect(SEGMENT_WEIGHTS[JACKPOT_SEGMENT_INDEX]).toBe(0);
    expect(JACKPOT_EVERY_PAID_SPINS).toBe(1000);
  });
});

describe("segmentForRoll", () => {
  it("covers every roll exactly in proportion to the weights", () => {
    const counts = new Array(8).fill(0);
    for (let r = 0; r < TOTAL_WEIGHT; r++) counts[segmentForRoll(r)]++;
    expect(counts).toEqual([...SEGMENT_WEIGHTS]);
  });

  it("never maps any roll to the jackpot", () => {
    for (let r = 0; r < TOTAL_WEIGHT; r++) expect(segmentForRoll(r)).not.toBe(JACKPOT_SEGMENT_INDEX);
  });

  it("rejects out-of-range rolls", () => {
    expect(() => segmentForRoll(TOTAL_WEIGHT)).toThrow(RangeError);
  });
});

describe("pickStandardReward", () => {
  it("returns a valid, non-jackpot segment every time", () => {
    for (let i = 0; i < 5000; i++) {
      const { segmentIndex, segment } = pickStandardReward();
      expect(segment).toBe(WHEEL_SEGMENTS[segmentIndex]);
      expect(segmentIndex).not.toBe(JACKPOT_SEGMENT_INDEX);
      expect(segment.value).toBeLessThanOrEqual(500);
    }
  });
});

describe("jackpot cycle: paid spins only", () => {
  const std = 1; // any ordinary segment index
  const EVERY = JACKPOT_EVERY_PAID_SPINS;

  it("isJackpotPaidSpin is true only on multiples of the cycle length", () => {
    const hits = [];
    for (let n = 0; n <= EVERY * 5; n++) if (isJackpotPaidSpin(n)) hits.push(n);
    expect(hits).toEqual([1, 2, 3, 4, 5].map((k) => k * EVERY));
  });

  it("free-ticket spins never advance the paid counter and never win the jackpot", () => {
    // even when the counter sits right before a jackpot, a free spin must not trigger or advance it
    for (const before of [0, 1, EVERY - 1, EVERY, EVERY * 2 - 1]) {
      const r = resolveSpin({ paid: false, paidSpinCountBefore: before, standardIndex: std });
      expect(r.jackpot).toBe(false);
      expect(r.segmentIndex).toBe(std);
      expect(r.paidSpinCountAfter).toBe(before);
    }
    let count = EVERY - 1;
    for (let i = 0; i < 1000; i++) {
      const r = resolveSpin({ paid: false, paidSpinCountBefore: count, standardIndex: std });
      expect(r.segmentIndex).not.toBe(JACKPOT_SEGMENT_INDEX);
      count = r.paidSpinCountAfter;
    }
    expect(count).toBe(EVERY - 1);
  });

  it("paid spins before the cycle ends never win the jackpot", () => {
    let count = 0;
    for (let n = 1; n <= EVERY - 1; n++) {
      const r = resolveSpin({ paid: true, paidSpinCountBefore: count, standardIndex: std });
      expect(r.jackpot).toBe(false);
      expect(r.segmentIndex).toBe(std);
      count = r.paidSpinCountAfter;
    }
    expect(count).toBe(EVERY - 1);
  });

  it("the paid spin that completes the cycle is the guaranteed 5,000-coin jackpot", () => {
    const r = resolveSpin({ paid: true, paidSpinCountBefore: EVERY - 1, standardIndex: std });
    expect(r.jackpot).toBe(true);
    expect(r.segmentIndex).toBe(JACKPOT_SEGMENT_INDEX);
    expect(WHEEL_SEGMENTS[r.segmentIndex].value).toBe(5000);
    expect(r.paidSpinCountAfter).toBe(EVERY);
  });

  it("credits balance = −cost + 5,000 on the jackpot spin", () => {
    const balanceBefore = 1000;
    const r = resolveSpin({ paid: true, paidSpinCountBefore: EVERY - 1, standardIndex: std });
    const prize = WHEEL_SEGMENTS[r.segmentIndex].value;
    expect(balanceBefore - WHEEL_SPIN_COST + prize).toBe(1000 - WHEEL_SPIN_COST + 5000);
  });

  it("a mixed run of 5 cycles of paid spins + free spins gives exactly 5 jackpots, all on paid #k·EVERY", () => {
    let count = 0;
    const jackpotAtPaidNumber: number[] = [];
    for (let i = 0; i < (EVERY * 5 * 3) / 2; i++) {
      const paid = i % 3 !== 2; // two paid for every free ticket spin
      const r = resolveSpin({ paid, paidSpinCountBefore: count, standardIndex: std });
      if (r.jackpot) jackpotAtPaidNumber.push(r.paidSpinCountAfter);
      count = r.paidSpinCountAfter;
    }
    expect(count).toBe(EVERY * 5);
    expect(jackpotAtPaidNumber).toEqual([1, 2, 3, 4, 5].map((k) => k * EVERY));
  });
});

describe("return to players (target ≈ 35%, owner keeps ≈ 65%)", () => {
  it("spin price is 50 and the long-run return is ~35% of it", () => {
    expect(WHEEL_SPIN_COST).toBe(50);
    const ev = expectedReturnPerPaidSpin();
    expect(ev.total).toBeCloseTo(ev.ordinary + ev.jackpot, 10);
    // If you change odds/prizes/price on purpose, update this range together with the comment in rewards.ts.
    expect(returnRatio()).toBeGreaterThan(0.34);
    expect(returnRatio()).toBeLessThan(0.36);
  });
  it("the jackpot alone would break the budget at the old cycle (200) — that is why the cycle is 1,000", () => {
    expect(expectedReturnPerPaidSpin(200).jackpot / WHEEL_SPIN_COST).toBeGreaterThanOrEqual(0.5);
    expect(expectedReturnPerPaidSpin().jackpot / WHEEL_SPIN_COST).toBeLessThan(0.15); // 5,000 / 1,000 = 5 coins = 10% of the price
  });
  it("small prizes hit often: about 3 in 10 spins win something", () => {
    const winWeight = WHEEL_SEGMENTS.reduce((sum, s, i) => sum + (s.type !== "none" ? SEGMENT_WEIGHTS[i] : 0), 0);
    expect(winWeight / TOTAL_WEIGHT).toBeGreaterThan(0.3);
  });
  it("prize ladder: 25 is half the price back, 50 is break-even", () => {
    const v = (k: string) => WHEEL_SEGMENTS.find((x) => x.key === k)?.value;
    expect(v("coins_25")).toBe(WHEEL_SPIN_COST / 2);
    expect(v("coins_50")).toBe(WHEEL_SPIN_COST);
  });
});

describe("luck card (+ความเฮง) odds", () => {
  const i500 = WHEEL_SEGMENTS.findIndex((s) => s.key === "coins_500");
  const iRetry = WHEEL_SEGMENTS.findIndex((s) => s.key === "retry_a");

  it("the wheel has exactly one retry slice and one luck-card slice", () => {
    expect(WHEEL_SEGMENTS.filter((s) => s.type === "none")).toHaveLength(1);
    expect(WHEEL_SEGMENTS.filter((s) => s.type === "luck_card")).toHaveLength(1);
  });

  it("buffed weights: 500-coin x1.3, the extra comes out of retry only, total unchanged", () => {
    const b = buffedWeights();
    expect(b[i500]).toBe(Math.round(SEGMENT_WEIGHTS[i500] * 1.3)); // 20 -> 26
    expect(b[iRetry]).toBe(SEGMENT_WEIGHTS[iRetry] - (b[i500] - SEGMENT_WEIGHTS[i500]));
    expect(b.reduce((a, c) => a + c, 0)).toBe(TOTAL_WEIGHT);
    b.forEach((w, i) => {
      if (i !== i500 && i !== iRetry) expect(w).toBe(SEGMENT_WEIGHTS[i]); // 25/50/150/free/card/jackpot untouched
    });
    expect(b[JACKPOT_SEGMENT_INDEX]).toBe(0);
  });

  it("buffed rolls map to the 500-coin slice 30% more often", () => {
    const b = buffedWeights();
    const count = (w: readonly number[]) => {
      let n = 0;
      for (let r = 0; r < TOTAL_WEIGHT; r++) if (segmentForRoll(r, w) === i500) n++;
      return n;
    };
    expect(count(b) / count(SEGMENT_WEIGHTS)).toBeCloseTo(1.3, 5);
  });

  it("pickStandardReward({ buffed: true }) is valid and never the jackpot", () => {
    for (let i = 0; i < 3000; i++) {
      const { segmentIndex } = pickStandardReward({ buffed: true });
      expect(segmentIndex).not.toBe(JACKPOT_SEGMENT_INDEX);
    }
  });

  it("a luck card is worth ~0.9 coins on average (3 rounds x 0.06% extra x 500), a tiny share of the budget", () => {
    expect(luckCardValueCoins()).toBeCloseTo(0.9, 5);
  });
});
