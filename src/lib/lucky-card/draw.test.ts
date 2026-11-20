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
  it("default odds return ~35% (7 of 20) with bonus counted twice and the guarantee on", () => {
    // If you change the odds on purpose, update this expectation together with the doc comment in lucky-card-config.ts.
    expect(Math.abs(expectedReturnPer20() - 7)).toBeLessThan(0.01); // analytic, includes the bonus guarantee
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

// ---- bonus guarantee ("pity") ----
import { PITY_AFTER_DRY_ROUNDS, PITY_BONUS_COINS, SECRET_PRIZE_THB } from "../lucky-card-config";
import { resolvePity } from "./draw";

describe("resolvePity (reference model of play_lucky_card in 0008)", () => {
  const msg = { kind: "message", messageId: "funny-01" } as const;
  it("counts dry rounds, then turns the next message into a guaranteed bonus", () => {
    expect(resolvePity(msg, 0, 50)).toMatchObject({ guaranteed: false, dryRounds: 1 });
    expect(resolvePity(msg, 48, 50)).toMatchObject({ guaranteed: false, dryRounds: 49 });
    expect(resolvePity(msg, 49, 50)).toMatchObject({ guaranteed: false, dryRounds: 50 });
    expect(resolvePity(msg, 50, 50)).toEqual({ outcome: { kind: "bonus", coins: PITY_BONUS_COINS }, guaranteed: true, dryRounds: 0 });
  });
  it("a natural bonus or secret resets the streak and is left untouched", () => {
    expect(resolvePity({ kind: "bonus", coins: 300 }, 49, 50)).toEqual({ outcome: { kind: "bonus", coins: 300 }, guaranteed: false, dryRounds: 0 });
    expect(resolvePity({ kind: "secret" }, 120, 50)).toEqual({ outcome: { kind: "secret" }, guaranteed: false, dryRounds: 0 });
  });
  it("is off when pityAfter is 0", () => {
    expect(resolvePity(msg, 999, 0)).toMatchObject({ guaranteed: false, dryRounds: 1000 });
  });
});

describe("long-run payout with the guarantee", () => {
  it("never goes more than PITY_AFTER_DRY_ROUNDS rounds without a bonus/secret, and returns ~35% (7.0 of 20)", () => {
    // seeded PRNG (mulberry32) so the test is deterministic
    let t = 0x9e3779b9;
    const prng = () => {
      t = (t + 0x6d2b79f5) | 0;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const rand = (n: number) => Math.floor(prng() * n);
    const N = 1_500_000;
    let dry = 0, maxDry = 0, units = 0, guaranteed = 0;
    for (let i = 0; i < N; i++) {
      const r = resolvePity(drawOutcome(rand), dry, PITY_AFTER_DRY_ROUNDS);
      dry = r.dryRounds;
      if (r.guaranteed) guaranteed++;
      maxDry = Math.max(maxDry, dry);
      if (r.outcome.kind === "bonus") units += 2 * r.outcome.coins;
      else if (r.outcome.kind === "secret") units += SECRET_PRIZE_THB;
    }
    expect(maxDry).toBeLessThanOrEqual(PITY_AFTER_DRY_ROUNDS);
    expect(guaranteed).toBeGreaterThan(0);
    expect(units / N).toBeGreaterThan(6.8);
    expect(units / N).toBeLessThan(7.2);
  });
});
