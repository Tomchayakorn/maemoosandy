import { describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
import { WHEEL_SPIN_COST } from "../pricing";
import { WHEEL_CASH_PCT } from "./cash";
import { HOT_STREAK_ROUNDS, HOT_TRIGGER_ONE_IN } from "./hot-streak";
import { BUFF_ROUNDS } from "./luck-card";
import { buffedWeights, HOT_WEIGHTS, JACKPOT_EVERY_PAID_SPINS, JACKPOT_SEGMENT_INDEX, SEGMENT_WEIGHTS, segmentForRoll, TOTAL_WEIGHT } from "./rewards";
import { WHEEL_SEGMENTS } from "./segments";

/**
 * Monte-Carlo simulation of the WHOLE state machine as the database applies it (every spin is a PAID spin):
 * jackpot on every Nth spin > luck-card buff > hot streak > ordinary; a card is used as soon as it is won and no buff is running;
 * a hot streak starts after a spin with probability 1/HOT_TRIGGER_ONE_IN when none is running; coin prizes count (1 + 25%) because of the cash tally.
 * Seeded, so the test is deterministic.
 */
function simulate(spins: number, seed = 20261121) {
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const roll = (weights: readonly number[]) => segmentForRoll(Math.floor(rnd() * TOTAL_WEIGHT), weights);
  const buffed = buffedWeights();

  let cards = 0, buff = 0, hot = 0, paid = 0;
  let payout = 0, hotSpins = 0, hotWins = 0, streaks = 0, buffSpins = 0, wins = 0, normalSpins = 0, normalWins = 0, overlaps = 0;
  const log: string[] = []; // first 10,000 spins, one symbol each
  const streakExamples: string[][] = [];
  let current: string[] | null = null;
  const symbol = (i: number, kind: string) => (WHEEL_SEGMENTS[i].type === "none" ? "·" : WHEEL_SEGMENTS[i].type === "coins" ? String(WHEEL_SEGMENTS[i].value) : WHEEL_SEGMENTS[i].type === "free_reading" ? "F" : "C") + (kind === "hot" ? "🔥" : kind === "buff" ? "✨" : "");

  for (let n = 0; n < spins; n++) {
    paid++;
    const isJackpot = paid % JACKPOT_EVERY_PAID_SPINS === 0;
    let kind = "normal";
    let idx: number;
    if (isJackpot) { idx = JACKPOT_SEGMENT_INDEX; kind = "jackpot"; }
    else if (buff > 0) { idx = roll(buffed); kind = "buff"; if (hot > 0) overlaps++; }
    else if (hot > 0) { idx = roll(HOT_WEIGHTS); kind = "hot"; }
    else idx = roll(SEGMENT_WEIGHTS);

    const seg = WHEEL_SEGMENTS[idx];
    if (seg.type === "coins") payout += seg.value * (isJackpot ? 1 : 1 + WHEEL_CASH_PCT / 100);
    else if (seg.type === "free_reading") payout += 99;
    else if (seg.type === "luck_card") cards++;
    const won = seg.type !== "none";
    if (won) wins++;
    if (kind === "hot") { hotSpins++; if (seg.type === "coins") hotWins++; }
    if (kind === "buff") buffSpins++;
    if (kind === "normal") { normalSpins++; if (won) normalWins++; }

    // state after the spin (same as spin_wheel_cycle)
    const trigger = Math.floor(rnd() * HOT_TRIGGER_ONE_IN) === 0;
    const hotBefore = hot;
    if (buff > 0) buff--;
    hot = hot > 0 ? hot - 1 : trigger ? HOT_STREAK_ROUNDS : 0;
    if (hotBefore === 0 && hot === HOT_STREAK_ROUNDS) { streaks++; current = []; }
    else if (current && (kind === "hot" || kind === "buff")) { current.push(symbol(idx, kind)); if (hotBefore === 1) { if (streakExamples.length < 6) streakExamples.push(current); current = null; } }
    if (cards > 0 && buff === 0) { cards--; buff = BUFF_ROUNDS; }
    if (n < 10000) log.push(symbol(idx, kind));
  }
  const price = WHEEL_SPIN_COST;
  return {
    spins,
    ratio: payout / (spins * price),
    ownerKeeps: 1 - payout / (spins * price),
    hotShare: hotSpins / spins,
    hotCoinWinRate: hotWins / Math.max(1, hotSpins),
    normalWinRate: normalWins / Math.max(1, normalSpins),
    overallWinRate: wins / spins,
    buffShare: buffSpins / spins,
    streaksPer1000: (streaks / spins) * 1000,
    spinsPerStreak: spins / Math.max(1, streaks),
    overlapShare: overlaps / spins,
    sample: log.slice(0, 120).join(" "),
    streakExamples: streakExamples.map((e) => e.join(" ")),
  };
}

describe("simulation of the whole wheel (jackpot + luck card/buff + hot streak + 25% tally)", () => {
  const r = simulate(2_000_000);
  try {
    mkdirSync("/tmp/wheelsim", { recursive: true });
    writeFileSync("/tmp/wheelsim/result.json", JSON.stringify(r, null, 2));
  } catch { /* the file is only for the human-readable report */ }

  it("long-run return stays ~35% (owner keeps ~65%)", () => {
    expect(r.ratio).toBeGreaterThan(0.335);
    expect(r.ratio).toBeLessThan(0.365);
  });

  it("hot streaks happen about once per ~250 spins plus the streak itself, ~2% of spins are hot", () => {
    expect(r.hotShare).toBeGreaterThan(0.017);
    expect(r.hotShare).toBeLessThan(0.023);
    expect(r.spinsPerStreak).toBeGreaterThan(240);
    expect(r.spinsPerStreak).toBeLessThan(270);
  });

  it("inside a streak about 80% of spins win coins", () => {
    expect(r.hotCoinWinRate).toBeGreaterThan(0.77);
    expect(r.hotCoinWinRate).toBeLessThan(0.83);
  });

  it("normal spins win less often than hot ones (and about as before: ~28%)", () => {
    expect(r.normalWinRate).toBeGreaterThan(0.26);
    expect(r.normalWinRate).toBeLessThan(0.3);
  });
});
