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
  it("default odds return 45-48% (9-9.6 of 20) with bonus counted twice and the two-step guarantee on", () => {
    // If you change the odds on purpose, update this expectation together with the doc comment in lucky-card-config.ts.
    expect(expectedReturnPer20()).toBeGreaterThan(9);
    expect(expectedReturnPer20()).toBeLessThan(9.6);
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

// ---- two-step guarantee ----
import {
  GUARANTEE_DRY_COINS,
  GUARANTEE_DRY_ROUNDS,
  GUARANTEE_EVERY_COINS,
  GUARANTEE_EVERY_ROUNDS,
  SECRET_PRIZE_THB,
} from "../lucky-card-config";
import { resolveGuarantee, type GuaranteeParams, type GuaranteeState } from "./draw";

const G: GuaranteeParams = { dryAfter: 10, dryCoins: 15, everyRounds: 25, everyCoins: 40 };
const msg = { kind: "message", messageId: "funny-01" } as const;

describe("resolveGuarantee (reference model of play_lucky_card in 0015)", () => {
  it("step 1: the 10th dry round in a row becomes a 15-coin bonus and resets the dry streak", () => {
    expect(resolveGuarantee(msg, { dryRounds: 8, cycleRounds: 3 }, G)).toMatchObject({ guaranteed: false, state: { dryRounds: 9, cycleRounds: 4 } });
    expect(resolveGuarantee(msg, { dryRounds: 9, cycleRounds: 3 }, G)).toEqual({
      outcome: { kind: "bonus", coins: 15 }, guaranteed: "dry", state: { dryRounds: 0, cycleRounds: 4 },
    });
  });
  it("step 2: the 25th round overall becomes a 40-coin bonus and wins over step 1", () => {
    expect(resolveGuarantee(msg, { dryRounds: 9, cycleRounds: 24 }, G)).toEqual({
      outcome: { kind: "bonus", coins: 40 }, guaranteed: "every", state: { dryRounds: 0, cycleRounds: 0 },
    });
    expect(resolveGuarantee(msg, { dryRounds: 2, cycleRounds: 24 }, G).guaranteed).toBe("every");
  });
  it("a natural bonus/secret is never replaced; it resets the dry streak but not the 25-round count", () => {
    expect(resolveGuarantee({ kind: "bonus", coins: 100 }, { dryRounds: 9, cycleRounds: 24 }, G)).toEqual({
      outcome: { kind: "bonus", coins: 100 }, guaranteed: false, state: { dryRounds: 0, cycleRounds: 0 },
    });
    expect(resolveGuarantee({ kind: "secret" }, { dryRounds: 5, cycleRounds: 10 }, G)).toEqual({
      outcome: { kind: "secret" }, guaranteed: false, state: { dryRounds: 0, cycleRounds: 11 },
    });
  });
  it("matches the configured numbers", () => {
    expect(G).toEqual({ dryAfter: GUARANTEE_DRY_ROUNDS, dryCoins: GUARANTEE_DRY_COINS, everyRounds: GUARANTEE_EVERY_ROUNDS, everyCoins: GUARANTEE_EVERY_COINS });
  });
});

describe("1,000,000-round simulation", () => {
  it("never exceeds 10 rounds without a bonus, pays a 40 every 25th round, and returns 45-48% (analytic == simulated)", () => {
    // seeded PRNG (mulberry32) so the test is deterministic
    let t = 0x9e3779b9;
    const prng = () => {
      t = (t + 0x6d2b79f5) | 0;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const rand = (n: number) => Math.floor(prng() * n);
    const N = 1_000_000;
    let st: GuaranteeState = { dryRounds: 0, cycleRounds: 0 };
    let maxDry = 0, units = 0, dryHits = 0, everyHits = 0;
    for (let i = 0; i < N; i++) {
      const r = resolveGuarantee(drawOutcome(rand), st, G);
      st = r.state;
      if (r.guaranteed === "dry") dryHits++;
      if (r.guaranteed === "every") everyHits++;
      maxDry = Math.max(maxDry, st.dryRounds);
      if (r.outcome.kind === "bonus") units += 2 * r.outcome.coins;
      else if (r.outcome.kind === "secret") units += SECRET_PRIZE_THB;
    }
    const evSim = units / N;
    console.log("lucky-card sim", { returnPct: ((evSim / 20) * 100).toFixed(2), analytic: ((expectedReturnPer20() / 20) * 100).toFixed(2), dryHits, everyHits, maxDry });
    expect(maxDry).toBeLessThan(GUARANTEE_DRY_ROUNDS);
    expect(everyHits).toBeLessThanOrEqual(N / GUARANTEE_EVERY_ROUNDS); // a natural win on the 25th round keeps its own prize
    expect(everyHits).toBeGreaterThan((N / GUARANTEE_EVERY_ROUNDS) * 0.97);
    expect(evSim / 20).toBeGreaterThan(0.45);
    expect(evSim / 20).toBeLessThan(0.48);
    expect(Math.abs(evSim - expectedReturnPer20())).toBeLessThan(0.25);
  });
});
