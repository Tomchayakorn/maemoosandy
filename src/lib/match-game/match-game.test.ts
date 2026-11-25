import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARDS, CLEAR_BONUS, COST, DAILY_ROUNDS, MAX_PAYOUT, MAX_TURNS, PAIR_REWARD, PAIRS, payoutFor, roundsLeft, SYMBOLS } from "./config";
import { dealLayout } from "./deal";
import { flip, newState, start, stepOf } from "./model";
import { reconcileMatch } from "./reconcile";
import { toMatchView, type MatchRoundView } from "./types";

const SQL = readFileSync(join(__dirname, "../../../supabase/migrations/0022_match_game.sql"), "utf8");
const LAYOUT = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
const DAY = "2026-11-26";

describe("matching game rules", () => {
  it("matches the owner's numbers and the SQL", () => {
    expect([COST, MAX_TURNS, PAIR_REWARD, CLEAR_BONUS, DAILY_ROUNDS, MAX_PAYOUT, CARDS]).toEqual([20, 12, 5, 15, 3, 45, 12]);
    expect(SYMBOLS).toHaveLength(PAIRS);
    const constant = (name: string) => Number(new RegExp(`function public\\.${name}\\(\\)[^$]*\\$\\$ select (\\d+); \\$\\$`).exec(SQL)?.[1]);
    expect(constant("match_cost")).toBe(COST);
    expect(constant("match_max_turns")).toBe(MAX_TURNS);
    expect(constant("match_pair_reward")).toBe(PAIR_REWARD);
    expect(constant("match_clear_bonus")).toBe(CLEAR_BONUS);
    expect(constant("match_daily_rounds")).toBe(DAILY_ROUNDS);
    for (const reason of ["power_win", "mystic_win", "voucher", "catgame_prize", "match_bet", "match_win", "match_bonus"]) expect(SQL).toContain(`'${reason}'`);
    // the layout is never given out while a round is active
    expect(SQL).toContain("'layout', case when r.status = 'finished' then to_jsonb(r.layout) else null end");
    expect(SQL).toContain("revoke all on public.match_game_rounds from anon, authenticated");
  });
  it("pays 5 a pair and 15 more only for a cleared board", () => {
    expect([0, 1, 5, 6].map(payoutFor)).toEqual([0, 5, 25, 45]);
    expect([0, 2, 3, 9].map(roundsLeft)).toEqual([3, 1, 0, 0]);
  });
  it("deals every symbol exactly twice, shuffled", () => {
    for (let i = 0; i < 50; i++) {
      const layout = dealLayout();
      expect([...layout].sort()).toEqual(LAYOUT);
    }
    expect(new Set(Array.from({ length: 30 }, () => dealLayout().join())).size).toBeGreaterThan(20);
    expect(dealLayout(() => 0)).not.toEqual(LAYOUT);
  });
  it("charges once, refuses repeats and the same card, and pays a cleared board once", () => {
    const s = newState(100);
    const r = start(s, LAYOUT, DAY);
    expect(s.balance).toBe(80);
    expect(() => start(s, LAYOUT, DAY)).toThrow("ACTIVE_ROUND_EXISTS");
    flip(s, r, 0, 0);
    expect(() => flip(s, r, 1, 0)).toThrow("STALE_ROUND_STATE");
    expect(() => flip(s, r, 0, 1)).toThrow("CARD_ALREADY_OPEN");
    expect(flip(s, r, 1, 1)).toEqual({ match: true, pairReward: 5, bonus: 0 });
    expect(() => flip(s, r, 1, 2)).toThrow("CARD_ALREADY_MATCHED");
    for (let p = 1; p < 6; p++) {
      flip(s, r, p * 2, stepOf(r));
      flip(s, r, p * 2 + 1, stepOf(r));
    }
    expect([r.status, r.pairs, r.turns, r.payout, s.balance]).toEqual(["finished", 6, 6, 45, 125]);
    expect(() => flip(s, r, 0, stepOf(r))).toThrow("ROUND_NOT_ACTIVE");
    expect(s.ledger.reduce((a, l) => a + l.delta, 0)).toBe(s.balance - 100);
  });
  it("ends after 12 turns and allows three rounds a day", () => {
    const s = newState(200);
    for (let n = 0; n < 3; n++) {
      const r = start(s, LAYOUT, DAY);
      while (r.status === "active") {
        flip(s, r, 0, stepOf(r));
        flip(s, r, 2, stepOf(r));
      }
      expect([r.turns, r.payout]).toEqual([MAX_TURNS, 0]);
    }
    expect(() => start(s, LAYOUT, DAY)).toThrow("DAILY_LIMIT_REACHED");
    expect(start(s, LAYOUT, "2026-11-27").status).toBe("active");
    expect(s.balance).toBe(120);
    expect(() => start(newState(19), LAYOUT, DAY)).toThrow("INSUFFICIENT_COINS");
    expect(() => start(newState(99), [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4], DAY)).toThrow("INVALID_LAYOUT");
  });
});

describe("matching game screen state", () => {
  const view = (over: Partial<MatchRoundView>): MatchRoundView => ({ roundId: "a", status: "active", turnsUsed: 0, pairs: 0, payout: 0, step: 0, matched: [], open: null, layout: null, balance: 0, roundsToday: 1, flip: null, ...over });
  it("never goes backwards, keeps a finished summary, and takes a new round", () => {
    expect(reconcileMatch(view({ step: 4 }), view({ step: 3 })).accepted).toBe(false);
    expect(reconcileMatch(view({ step: 4 }), view({ step: 5 })).round?.step).toBe(5);
    expect(reconcileMatch(view({ status: "finished", step: 12 }), view({ step: 12 })).accepted).toBe(false);
    expect(reconcileMatch(view({ status: "finished" }), null).round?.status).toBe("finished");
    expect(reconcileMatch(view({ step: 4 }), view({ roundId: "b" })).round?.roundId).toBe("b");
    expect(reconcileMatch(view({}), null).round).toBeNull();
  });
  it("drops the layout from an active round even if one were sent", () => {
    const raw = { round_id: "a", status: "active" as const, turns_used: 0, pairs: 0, payout: 0, step: 0, matched: [], open: null, layout: LAYOUT, balance: 1, rounds_today: 1 };
    expect(toMatchView(raw).layout).toBeNull();
  });
});
