import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  bangkokDate, buildBoard, canPlayToday, CAT_COUNT, CAT_GAME_COST, CAT_REWARDS, expectedReward, nextPlayAt,
} from "./config";
import { drawCatReward } from "./draw";

function seeded(seed = 0x9e3779b9) {
  let t = seed;
  return (n: number) => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
}

describe("rewards", () => {
  it("are 200/300/400/500/1000, cost 9", () => {
    expect([...CAT_REWARDS]).toEqual([200, 300, 400, 500, 1000]);
    expect(CAT_GAME_COST).toBe(9);
    expect(expectedReward()).toBe(480);
  });
  it("forced rolls map to each level", () => {
    CAT_REWARDS.forEach((r, i) => expect(drawCatReward(() => i)).toBe(r));
  });
  it("1,000,000 draws: each level ~20% (within 0.3 points) and the mean is ~480", () => {
    const rand = seeded();
    const counts = new Map<number, number>();
    const N = 1_000_000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const r = drawCatReward(rand);
      counts.set(r, (counts.get(r) ?? 0) + 1);
      sum += r;
    }
    for (const r of CAT_REWARDS) expect(Math.abs((counts.get(r) ?? 0) / N - 0.2)).toBeLessThan(0.003);
    expect(Math.abs(sum / N - 480)).toBeLessThan(2);
  });
});

describe("board", () => {
  it("has 9 cats: 3 orange, 3 black, 3 white, each with its image", () => {
    const b = buildBoard();
    expect(b).toHaveLength(CAT_COUNT);
    for (const [color, src] of [["orange", "/images/cat-orange.jpeg"], ["black", "/images/cat-black.jpeg"], ["white", "/images/cat-white.jpeg"]] as const) {
      const cats = b.filter((c) => c.color === color);
      expect(cats).toHaveLength(3);
      expect(cats.every((c) => c.src === src)).toBe(true);
    }
    expect(new Set(b.map((c) => c.index)).size).toBe(9);
  });
  it("supports several images per colour", () => {
    const b = buildBoard({ orange: ["a.jpg", "b.jpg"], black: ["c.jpg"], white: ["d.jpg"] });
    expect(b.filter((c) => c.color === "orange").map((c) => c.src)).toEqual(["a.jpg", "b.jpg", "a.jpg"]);
  });
});

describe("daily limit (reference model of play_cat_game)", () => {
  it("uses the Bangkok calendar day (UTC+7)", () => {
    expect(bangkokDate(new Date("2026-11-22T16:59:59Z"))).toBe("2026-11-22");
    expect(bangkokDate(new Date("2026-11-22T17:00:00Z"))).toBe("2026-11-23");
  });
  it("one play per Bangkok day, free again after midnight", () => {
    const morning = new Date("2026-11-22T01:00:00Z"); // 08:00 Bangkok
    expect(canPlayToday(null, morning)).toBe(true);
    expect(canPlayToday("2026-11-22", morning)).toBe(false);
    expect(canPlayToday("2026-11-22", new Date("2026-11-22T16:59:00Z"))).toBe(false); // 23:59 Bangkok
    expect(canPlayToday("2026-11-22", new Date("2026-11-22T17:00:00Z"))).toBe(true); // 00:00 next day
  });
  it("next play time is the next Bangkok midnight", () => {
    expect(nextPlayAt(new Date("2026-11-22T01:00:00Z")).toISOString()).toBe("2026-11-22T17:00:00.000Z");
    expect(nextPlayAt(new Date("2026-11-22T17:00:00Z")).toISOString()).toBe("2026-11-23T17:00:00.000Z");
  });
});

import {
  _resetSurpriseMemory, catSurpriseState, dismissSurprise, isSurpriseDismissed, SURPRISE_MAX_BALANCE, surpriseDismissKey,
} from "./surprise";

describe("surprise pop-up eligibility (9..20 coins, daily chance unused)", () => {
  it("offers the game for 9..20 coins when today's play is unused", () => {
    for (const b of [9, 10, 15, 20]) expect(catSurpriseState(b, false)).toBe("offer");
  });
  it("shows the 'need at least 9 coins' state below 9", () => {
    for (const b of [0, 1, 8]) expect(catSurpriseState(b, false)).toBe("low");
  });
  it("no pop-up above 20 coins or after today's play", () => {
    expect(SURPRISE_MAX_BALANCE).toBe(20);
    for (const b of [21, 100, 5000]) expect(catSurpriseState(b, false)).toBeNull();
    for (const b of [0, 8, 9, 20]) expect(catSurpriseState(b, true)).toBeNull();
    expect(catSurpriseState(Number.NaN, false)).toBeNull();
    expect(catSurpriseState(-1, false)).toBeNull();
  });
  it("the 'offer' boundary is exactly the cost of a play", () => {
    expect(catSurpriseState(CAT_GAME_COST - 1, false)).toBe("low");
    expect(catSurpriseState(CAT_GAME_COST, false)).toBe("offer");
  });
});

describe("surprise dismissal", () => {
  function fake() {
    const d = new Map<string, string>();
    return { d, getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) };
  }
  it("a dismissed pop-up stays closed for that user/state/day, but not for others", () => {
    _resetSurpriseMemory();
    const s = fake();
    const k = surpriseDismissKey("u1", "offer", "2026-11-22");
    expect(isSurpriseDismissed(k, s)).toBe(false);
    dismissSurprise(k, s);
    expect(isSurpriseDismissed(k, s)).toBe(true);
    _resetSurpriseMemory();
    expect(isSurpriseDismissed(k, s)).toBe(true); // survives a reload within the session (storage)
    expect(isSurpriseDismissed(surpriseDismissKey("u1", "low", "2026-11-22"), s)).toBe(false);
    expect(isSurpriseDismissed(surpriseDismissKey("u2", "offer", "2026-11-22"), s)).toBe(false);
    expect(isSurpriseDismissed(surpriseDismissKey("u1", "offer", "2026-11-23"), s)).toBe(false); // next day asks again
  });
  it("works when sessionStorage is blocked", () => {
    _resetSurpriseMemory();
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    const k = surpriseDismissKey("u3", "low", "2026-11-22");
    expect(() => dismissSurprise(k, broken)).not.toThrow();
    expect(isSurpriseDismissed(k, broken)).toBe(true);
  });
});
