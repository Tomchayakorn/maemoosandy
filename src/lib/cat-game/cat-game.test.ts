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

describe("surprise pop-up eligibility (0..50 coins, daily chance unused)", () => {
  it("offers the game for 9..50 coins when today's play is unused", () => {
    for (const b of [9, 10, 15, 20, 21, 49, 50]) expect(catSurpriseState(b, false)).toBe("offer");
  });
  it("shows the 'need at least 9 coins' state for 0..8", () => {
    for (const b of [0, 1, 8]) expect(catSurpriseState(b, false)).toBe("low");
  });
  it("no pop-up above 50 coins or after today's play", () => {
    expect(SURPRISE_MAX_BALANCE).toBe(50);
    for (const b of [51, 100, 5000]) expect(catSurpriseState(b, false)).toBeNull();
    for (const b of [0, 8, 9, 20, 50, 51]) expect(catSurpriseState(b, true)).toBeNull();
    expect(catSurpriseState(Number.NaN, false)).toBeNull();
    expect(catSurpriseState(-1, false)).toBeNull();
  });
  it("boundaries 0, 8, 9, 20, 50, 51", () => {
    expect([0, 8, 9, 20, 50, 51].map((b) => catSurpriseState(b, false))).toEqual(["low", "low", "offer", "offer", "offer", null]);
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

import { applyAdminReset, matchUser } from "./admin";

describe("admin reset of the daily chance (reference model of admin_reset_cat_game, 0017)", () => {
  const played = { balance: 591, ledgerCoins: 491, todayPlay: { catIndex: 4, reward: 500 }, resets: [] };
  it("removes today's play only: balance and ledger stay exactly as they were, and the reset is logged", () => {
    const r = applyAdminReset(played, "admin@x.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.todayPlay).toBeNull();
    expect(r.state.balance).toBe(591);
    expect(r.state.ledgerCoins).toBe(491);
    expect(r.state.resets).toEqual([{ removedReward: 500, by: "admin@x.com" }]);
    expect(canPlayToday(r.state.todayPlay ? bangkokDate(new Date("2026-11-22T01:00:00Z")) : null, new Date("2026-11-22T01:00:00Z"))).toBe(true);
  });
  it("refuses when there is nothing to reset (also on a second reset) or no admin name", () => {
    expect(applyAdminReset({ ...played, todayPlay: null }, "a")).toEqual({ ok: false, error: "NOTHING_TO_RESET" });
    const first = applyAdminReset(played, "a");
    if (first.ok) expect(applyAdminReset(first.state, "a")).toEqual({ ok: false, error: "NOTHING_TO_RESET" });
    expect(applyAdminReset(played, "")).toEqual({ ok: false, error: "INVALID_AMOUNT" });
  });
});

describe("matchUser", () => {
  const users = [{ id: "11111111-1111-1111-1111-111111111111", email: "A@x.com" }, { id: "22222222-2222-2222-2222-222222222222", email: null }];
  it("matches exact email (case-insensitive) or exact id, never partial", () => {
    expect(matchUser(users, " a@X.com ")?.id).toBe(users[0].id);
    expect(matchUser(users, "22222222-2222-2222-2222-222222222222")?.id).toBe(users[1].id);
    expect(matchUser(users, "a@x")).toBeNull();
    expect(matchUser(users, "")).toBeNull();
  });
});

import { _resetSurpriseBlocks, addSurpriseBlock, hasSurpriseBlock, removeSurpriseBlock, subscribeSurpriseBlock } from "./surprise-block";
import { surpriseToShow } from "./surprise";

describe("surprise appears live and never on top of another pop-up", () => {
  it("a round that leaves 40 coins shows the offer once the result is closed, not before", () => {
    _resetSurpriseBlocks();
    expect(surpriseToShow(70, false, hasSurpriseBlock())).toBeNull(); // 70 coins: nothing
    addSurpriseBlock("round"); // the round / result is on screen
    expect(surpriseToShow(40, false, hasSurpriseBlock())).toBeNull(); // balance is now 40 but the result is showing: wait
    removeSurpriseBlock("round"); // player closes the result / starts a new round
    expect(surpriseToShow(40, false, hasSurpriseBlock())).toBe("offer");
  });
  it("0..8 coins show the 'need 9 coins' notice, 51 does not, a used chance never does", () => {
    expect(surpriseToShow(8, false, false)).toBe("low");
    expect(surpriseToShow(0, false, false)).toBe("low");
    expect(surpriseToShow(50, false, false)).toBe("offer");
    expect(surpriseToShow(51, false, false)).toBeNull();
    expect(surpriseToShow(30, true, false)).toBeNull();
  });
  it("the unconfirmed rules pop-up blocks it, even with a qualifying balance", () => {
    _resetSurpriseBlocks();
    addSurpriseBlock("rules");
    expect(surpriseToShow(25, false, hasSurpriseBlock())).toBeNull();
    removeSurpriseBlock("rules"); // rules confirmed / closed
    expect(surpriseToShow(25, false, hasSurpriseBlock())).toBe("offer");
  });
  it("counts several blockers and notifies listeners only on real changes", () => {
    _resetSurpriseBlocks();
    let n = 0;
    const off = subscribeSurpriseBlock(() => n++);
    addSurpriseBlock("a");
    addSurpriseBlock("a"); // duplicate: no change
    addSurpriseBlock("b");
    removeSurpriseBlock("a");
    expect(hasSurpriseBlock()).toBe(true); // "b" still blocks
    removeSurpriseBlock("b");
    removeSurpriseBlock("b"); // already gone: no change
    expect(hasSurpriseBlock()).toBe(false);
    expect(n).toBe(4);
    off();
  });
});
