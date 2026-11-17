import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  isJackpotPaidSpin,
  JACKPOT_EVERY_PAID_SPINS,
  JACKPOT_SEGMENT_INDEX,
  pickStandardReward,
  resolveSpin,
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
  it("has 8 segments, one weight each; ordinary weights total 99", () => {
    expect(WHEEL_SEGMENTS).toHaveLength(8);
    expect(SEGMENT_WEIGHTS).toHaveLength(8);
    expect(TOTAL_WEIGHT).toBe(99);
  });

  it("matches the agreed ordinary odds, with the jackpot at weight 0", () => {
    expect(odds()).toEqual({
      none: 37,
      "coins:10": 35,
      "coins:20": 20,
      "coins:50": 5,
      "free_reading:1": 2,
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
    expect(JACKPOT_EVERY_PAID_SPINS).toBe(200);
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
      expect(segment.value).toBeLessThanOrEqual(50);
    }
  });
});

describe("jackpot cycle: paid spins only", () => {
  const std = 1; // any ordinary segment index

  it("isJackpotPaidSpin is true only on multiples of 200", () => {
    const hits = [];
    for (let n = 0; n <= 1000; n++) if (isJackpotPaidSpin(n)) hits.push(n);
    expect(hits).toEqual([200, 400, 600, 800, 1000]);
  });

  it("free-ticket spins never advance the paid counter and never win the jackpot", () => {
    // even when the counter sits right before a jackpot, a free spin must not trigger or advance it
    for (const before of [0, 1, 199, 200, 399]) {
      const r = resolveSpin({ paid: false, paidSpinCountBefore: before, standardIndex: std });
      expect(r.jackpot).toBe(false);
      expect(r.segmentIndex).toBe(std);
      expect(r.paidSpinCountAfter).toBe(before);
    }
    let count = 199;
    for (let i = 0; i < 1000; i++) {
      const r = resolveSpin({ paid: false, paidSpinCountBefore: count, standardIndex: std });
      expect(r.segmentIndex).not.toBe(JACKPOT_SEGMENT_INDEX);
      count = r.paidSpinCountAfter;
    }
    expect(count).toBe(199);
  });

  it("paid spins #1–#199 never win the jackpot", () => {
    let count = 0;
    for (let n = 1; n <= 199; n++) {
      const r = resolveSpin({ paid: true, paidSpinCountBefore: count, standardIndex: std });
      expect(r.jackpot).toBe(false);
      expect(r.segmentIndex).toBe(std);
      count = r.paidSpinCountAfter;
    }
    expect(count).toBe(199);
  });

  it("paid spin #200 is the guaranteed 5,000-coin jackpot", () => {
    const r = resolveSpin({ paid: true, paidSpinCountBefore: 199, standardIndex: std });
    expect(r.jackpot).toBe(true);
    expect(r.segmentIndex).toBe(JACKPOT_SEGMENT_INDEX);
    expect(WHEEL_SEGMENTS[r.segmentIndex].value).toBe(5000);
    expect(r.paidSpinCountAfter).toBe(200);
  });

  it("credits balance = −99 + 5,000 on the jackpot spin", () => {
    const balanceBefore = 1000;
    const r = resolveSpin({ paid: true, paidSpinCountBefore: 199, standardIndex: std });
    const prize = WHEEL_SEGMENTS[r.segmentIndex].value;
    expect(balanceBefore - 99 + prize).toBe(5901);
  });

  it("a mixed run of 1,000 paid + 500 free spins gives exactly 5 jackpots, all on paid #200k", () => {
    let count = 0;
    const jackpotAtPaidNumber: number[] = [];
    for (let i = 0; i < 1500; i++) {
      const paid = i % 3 !== 2; // two paid for every free ticket spin
      const r = resolveSpin({ paid, paidSpinCountBefore: count, standardIndex: std });
      if (r.jackpot) jackpotAtPaidNumber.push(r.paidSpinCountAfter);
      count = r.paidSpinCountAfter;
    }
    expect(count).toBe(1000);
    expect(jackpotAtPaidNumber).toEqual([200, 400, 600, 800, 1000]);
  });
});
