import { describe, expect, it } from "vitest";
import {
  bangkokDayStart,
  bangkokWeekStart,
  cashCredit,
  cashUiState,
  requestCashWithdrawal,
  reviewCashWithdrawal,
  smallTierUsage,
  WHEEL_CASH_BIG,
  WHEEL_CASH_LIMITS,
  WHEEL_CASH_SMALL,
  type CashModelState,
} from "./cash";

// Bangkok = UTC+7. 2026-11-18 is a Wednesday.
const at = (iso: string) => new Date(iso);
const empty = (total: number): CashModelState => ({ total, requests: [] });

describe("tally credit", () => {
  it("25% of the coin prize, floored", () => {
    expect(cashCredit(20)).toBe(5);
    expect(cashCredit(40)).toBe(10);
    expect(cashCredit(120)).toBe(30);
    expect(cashCredit(400)).toBe(100);
    expect(cashCredit(0)).toBe(0);
    expect(cashCredit(7)).toBe(1); // floor, like the SQL integer division
  });
});

describe("Bangkok day / week boundaries", () => {
  it("the day starts at 00:00 Bangkok (17:00 UTC the day before)", () => {
    expect(bangkokDayStart(at("2026-11-18T10:00:00Z")).toISOString()).toBe("2026-11-17T17:00:00.000Z");
    expect(bangkokDayStart(at("2026-11-17T16:59:59Z")).toISOString()).toBe("2026-11-16T17:00:00.000Z");
    expect(bangkokDayStart(at("2026-11-17T17:00:00Z")).toISOString()).toBe("2026-11-17T17:00:00.000Z");
  });
  it("the week starts on Monday 00:00 Bangkok", () => {
    expect(bangkokWeekStart(at("2026-11-18T10:00:00Z")).toISOString()).toBe("2026-11-15T17:00:00.000Z"); // Mon 16 Nov
    expect(bangkokWeekStart(at("2026-11-22T16:00:00Z")).toISOString()).toBe("2026-11-15T17:00:00.000Z"); // Sun 23 Nov 23:00 still that week
    expect(bangkokWeekStart(at("2026-11-22T17:00:00Z")).toISOString()).toBe("2026-11-22T17:00:00.000Z"); // Mon 23 Nov 00:00 = new week
  });
});

describe("quota usage (small tier only; rejected frees the slot)", () => {
  const now = at("2026-11-18T10:00:00Z");
  it("counts pending + approved small requests today and this week", () => {
    const rows = [
      { amount_thb: 500, status: "approved" as const, created_at: "2026-11-18T01:00:00Z" },
      { amount_thb: 500, status: "pending" as const, created_at: "2026-11-16T05:00:00Z" },
      { amount_thb: 500, status: "rejected" as const, created_at: "2026-11-18T02:00:00Z" },
      { amount_thb: 5000, status: "approved" as const, created_at: "2026-11-18T03:00:00Z" },
      { amount_thb: 500, status: "approved" as const, created_at: "2026-11-10T03:00:00Z" },
    ];
    expect(smallTierUsage(rows, now)).toEqual({ day: 1, week: 2 });
  });
  it("UI state: ready only with enough tally, nothing pending and quota left", () => {
    expect(cashUiState(499, false, { day: 0, week: 0 }).small.ready).toBe(false);
    expect(cashUiState(500, false, { day: 0, week: 0 }).small.ready).toBe(true);
    expect(cashUiState(500, true, { day: 0, week: 0 }).small).toMatchObject({ ready: false, blocked: "pending" });
    expect(cashUiState(900, false, { day: 1, week: 1 }).small).toMatchObject({ ready: false, blocked: "day" });
    expect(cashUiState(900, false, { day: 0, week: 3 }).small).toMatchObject({ ready: false, blocked: "week" });
    expect(cashUiState(5000, false, { day: 1, week: 3 }).big.ready).toBe(true); // the big tier has no quota
    expect(cashUiState(5000, true, { day: 0, week: 0 }).big.ready).toBe(false);
  });
});

describe("cash-out rules (model of request_wheel_cash_withdrawal / review in migration 0013)", () => {
  const now = at("2026-11-18T10:00:00Z");

  it("rejects an unknown tier and a tally below the tier", () => {
    expect(requestCashWithdrawal(empty(9999), 1000, now).result).toEqual({ kind: "error", code: "INVALID_TIER" });
    expect(requestCashWithdrawal(empty(499), WHEEL_CASH_SMALL, now).result).toEqual({ kind: "error", code: "WHEEL_CASH_NOT_ENOUGH" });
    expect(requestCashWithdrawal(empty(4999), WHEEL_CASH_BIG, now).result).toEqual({ kind: "error", code: "WHEEL_CASH_NOT_ENOUGH" });
  });

  it("reserves the tier immediately", () => {
    const r = requestCashWithdrawal(empty(700), WHEEL_CASH_SMALL, now);
    expect(r.result).toEqual({ kind: "created", requestId: 1 });
    expect(r.state.total).toBe(200);
  });

  it("double click / two tabs: a pending request is returned, nothing is reserved twice", () => {
    const a = requestCashWithdrawal(empty(2000), WHEEL_CASH_SMALL, now);
    const b = requestCashWithdrawal(a.state, WHEEL_CASH_SMALL, now);
    const c = requestCashWithdrawal(b.state, WHEEL_CASH_BIG, now); // even another tier waits for the first
    expect(b.result).toEqual({ kind: "already_pending", requestId: 1 });
    expect(c.result).toEqual({ kind: "already_pending", requestId: 1 });
    expect(c.state.total).toBe(1500);
  });

  it("small tier: 1 per day, then 3 per week; the next day works again, the 4th of the week does not", () => {
    let s = empty(5000 - 1); // plenty for several small tiers, but below the big tier
    const days = ["2026-11-16T05:00:00Z", "2026-11-17T05:00:00Z", "2026-11-18T05:00:00Z"]; // Mon, Tue, Wed (Bangkok)
    for (const d of days) {
      const req = requestCashWithdrawal(s, WHEEL_CASH_SMALL, at(d));
      expect(req.result.kind).toBe("created");
      // a second request the same day is blocked by the quota once the first is approved (no pending left)
      const approved = reviewCashWithdrawal(req.state, (req.result as { requestId: number }).requestId, true);
      s = approved.state;
      expect(requestCashWithdrawal(s, WHEEL_CASH_SMALL, at(d)).result).toEqual({ kind: "error", code: "WHEEL_CASH_DAILY_LIMIT" });
    }
    // Thursday: daily slot is free, but 3 approved this week already
    expect(requestCashWithdrawal(s, WHEEL_CASH_SMALL, at("2026-11-19T05:00:00Z")).result).toEqual({ kind: "error", code: "WHEEL_CASH_WEEKLY_LIMIT" });
    // next Monday (Bangkok) the week resets
    expect(requestCashWithdrawal(s, WHEEL_CASH_SMALL, at("2026-11-23T05:00:00Z")).result.kind).toBe("created");
  });

  it("the big tier has no daily/weekly quota", () => {
    let s = empty(20000);
    for (let i = 0; i < 4; i++) {
      const req = requestCashWithdrawal(s, WHEEL_CASH_BIG, now);
      expect(req.result.kind).toBe("created");
      s = reviewCashWithdrawal(req.state, (req.result as { requestId: number }).requestId, true).state;
    }
    expect(s.total).toBe(0);
  });

  it("approve changes the status only; reject refunds the tier once and frees the quota slot", () => {
    const req = requestCashWithdrawal(empty(1000), WHEEL_CASH_SMALL, now);
    const approved = reviewCashWithdrawal(req.state, 1, true);
    expect(approved.state.total).toBe(500);
    expect(reviewCashWithdrawal(approved.state, 1, false).result).toEqual({ kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" });

    const rej = reviewCashWithdrawal(req.state, 1, false);
    expect(rej.state.total).toBe(1000);
    expect(reviewCashWithdrawal(rej.state, 1, false).result).toEqual({ kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" });
    // the rejected request does not count against today's quota
    expect(requestCashWithdrawal(rej.state, WHEEL_CASH_SMALL, now).result.kind).toBe("created");
  });

  it("invariant: tally + reserved + paid out is conserved and never negative over a random sequence", () => {
    let t = 4242;
    const rnd = (n: number) => ((t = (t * 1103515245 + 12345) & 0x7fffffff), t % n);
    let s = empty(30000);
    let paid = 0;
    for (let i = 0; i < 1500; i++) {
      const when = new Date(at("2026-11-16T05:00:00Z").getTime() + rnd(14 * 24) * 3_600_000);
      const pending = s.requests.find((r) => r.status === "pending");
      const roll = rnd(5);
      if (roll < 2) s = requestCashWithdrawal(s, rnd(4) === 0 ? WHEEL_CASH_BIG : WHEEL_CASH_SMALL, when).state;
      else if (pending) {
        const approve = roll !== 4;
        s = reviewCashWithdrawal(s, pending.id, approve).state;
        if (approve) paid += pending.tier;
      }
      const reserved = s.requests.filter((r) => r.status === "pending").reduce((a, r) => a + r.tier, 0);
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.requests.filter((r) => r.status === "pending").length).toBeLessThanOrEqual(1);
      expect(s.total + reserved + paid).toBe(30000);
    }
  });

  it("limits are 1 per day and 3 per week", () => {
    expect(WHEEL_CASH_LIMITS).toEqual({ perDay: 1, perWeek: 3 });
  });
});
