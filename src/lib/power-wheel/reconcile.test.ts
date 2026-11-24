import { describe, expect, it } from "vitest";
import { reconcileRound } from "./reconcile";
import type { PowerRoundView } from "./types";

const view = (o: Partial<PowerRoundView> = {}): PowerRoundView => ({
  roundId: "r1", status: "active", bet: 100, level: 3, payout: 138, balance: 900, auto: null, slice: null, failed: false, ...o,
});

describe("reconcileRound", () => {
  it("ignores an older answer for the same round (level 5 on screen, a stale level 3 arrives)", () => {
    const local = view({ level: 5, payout: 248 });
    const out = reconcileRound(local, view({ level: 3 }));
    expect(out.accepted).toBe(false);
    expect(out.round).toBe(local);
  });
  it("accepts the same level or a higher one", () => {
    expect(reconcileRound(view({ level: 5 }), view({ level: 5 })).accepted).toBe(true);
    const higher = view({ level: 6 });
    expect(reconcileRound(view({ level: 5 }), higher)).toEqual({ accepted: true, round: higher });
  });
  it("a screen restored from cache (level 3) catches up to the server (level 5)", () => {
    const server = view({ level: 5 });
    expect(reconcileRound(view({ level: 3 }), server)).toEqual({ accepted: true, round: server });
  });
  it("a finished round never goes back to active", () => {
    const local = view({ status: "lost", level: 5 });
    expect(reconcileRound(local, view({ level: 5 })).accepted).toBe(false);
  });
  it("a finished round on the server replaces an active one (cashed in another tab)", () => {
    const server = view({ status: "cashed", level: 5 });
    expect(reconcileRound(view({ level: 5 }), server)).toEqual({ accepted: true, round: server });
  });
  it("a different round or no round is always accepted", () => {
    const other = view({ roundId: "r2", level: 1 });
    expect(reconcileRound(view({ level: 5 }), other)).toEqual({ accepted: true, round: other });
    expect(reconcileRound(view({ level: 5 }), null)).toEqual({ accepted: true, round: null });
    expect(reconcileRound(null, view())).toEqual({ accepted: true, round: view() });
  });
});
