import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LUCKY_CARD_MESSAGES } from "../../data/lucky-card-messages";
import { expectedReturnPer20, ODDS, ODDS_MESSAGE, ODDS_TOTAL, validateLuckyCardConfig } from "../lucky-card-config";
import { drawOutcome, kindForRoll } from "./draw";

describe("lucky card config", () => {
  it("is consistent", () => {
    expect(() => validateLuckyCardConfig()).not.toThrow();
    expect(ODDS.bonus100 + ODDS.bonus300 + ODDS.bonus500 + ODDS.secret + ODDS_MESSAGE).toBe(ODDS_TOTAL);
  });
});

describe("expected return", () => {
  it("default odds return ~30% (6 of 20) with bonus counted twice", () => {
    // If you change the odds on purpose, update this expectation together with the doc comment in lucky-card-config.ts.
    expect(expectedReturnPer20()).toBeCloseTo(6, 5);
  });
});

describe("messages", () => {
  it("has 108 unique ids, 36 per category", () => {
    expect(LUCKY_CARD_MESSAGES).toHaveLength(108);
    expect(new Set(LUCKY_CARD_MESSAGES.map((m) => m.id)).size).toBe(108);
    for (const c of ["funny", "encourage", "luck"]) {
      expect(LUCKY_CARD_MESSAGES.filter((m) => m.category === c)).toHaveLength(36);
    }
  });
});

describe("kindForRoll", () => {
  it("maps the boundaries of the odds table", () => {
    expect(kindForRoll(0)).toBe("bonus100");
    expect(kindForRoll(ODDS.bonus100 - 1)).toBe("bonus100");
    expect(kindForRoll(ODDS.bonus100)).toBe("bonus300");
    expect(kindForRoll(ODDS.bonus100 + ODDS.bonus300)).toBe("bonus500");
    expect(kindForRoll(ODDS.bonus100 + ODDS.bonus300 + ODDS.bonus500)).toBe("secret");
    expect(kindForRoll(ODDS_TOTAL - ODDS_MESSAGE)).toBe("message");
    expect(kindForRoll(ODDS_TOTAL - 1)).toBe("message");
  });
});

describe("drawOutcome", () => {
  it("returns the matching outcome for forced rolls", () => {
    expect(drawOutcome(() => 0)).toEqual({ kind: "bonus", coins: 100 });
    expect(drawOutcome((n) => (n === ODDS_TOTAL ? ODDS.bonus100 + ODDS.bonus300 : 0))).toEqual({ kind: "bonus", coins: 500 });
    expect(drawOutcome((n) => (n === ODDS_TOTAL ? ODDS_TOTAL - ODDS_MESSAGE - ODDS.secret : 0))).toEqual({ kind: "secret" });
    const msg = drawOutcome((n) => (n === ODDS_TOTAL ? ODDS_TOTAL - 1 : 5));
    expect(msg).toEqual({ kind: "message", messageId: LUCKY_CARD_MESSAGES[5].id });
  });
});
