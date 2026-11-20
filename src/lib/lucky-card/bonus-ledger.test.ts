import { describe, expect, it } from "vitest";
import { requestBonusWithdrawal, reviewBonusWithdrawal, type BonusState } from "./bonus-ledger";

const start = (total: number): BonusState => ({ total, requests: [] });

describe("bonus cash-out: anti-duplicate rules (model of migration 0009)", () => {
  it("rejects a request below 1,000 and leaves the counter alone", () => {
    const { state, result } = requestBonusWithdrawal(start(999));
    expect(result).toEqual({ kind: "error", code: "BONUS_NOT_ENOUGH" });
    expect(state.total).toBe(999);
    expect(state.requests).toHaveLength(0);
  });

  it("reserves 1,000 immediately when the request is created", () => {
    const { state, result } = requestBonusWithdrawal(start(1400));
    expect(result).toEqual({ kind: "created", requestId: 1 });
    expect(state.total).toBe(400);
    expect(state.requests).toEqual([{ id: 1, status: "pending", reserved: true }]);
  });

  it("double click / two tabs / two devices: the second request returns the same one and reserves nothing", () => {
    let s = start(2300); // enough for two withdrawals — still only ONE may be pending
    const a = requestBonusWithdrawal(s);
    s = a.state;
    const b = requestBonusWithdrawal(s); // 2nd tab
    s = b.state;
    const c = requestBonusWithdrawal(s); // 3rd attempt
    s = c.state;
    expect(a.result.kind).toBe("created");
    expect(b.result).toEqual({ kind: "already_pending", requestId: 1 });
    expect(c.result).toEqual({ kind: "already_pending", requestId: 1 });
    expect(s.total).toBe(1300); // 2,300 − 1,000 once, not three times
    expect(s.requests.filter((r) => r.status === "pending")).toHaveLength(1);
  });

  it("approve changes the status only — no second deduction", () => {
    let s = requestBonusWithdrawal(start(1000)).state; // total 0, 1 pending
    const r = reviewBonusWithdrawal(s, 1, true);
    s = r.state;
    expect(r.result).toEqual({ kind: "approved" });
    expect(s.total).toBe(0);
    expect(s.requests[0].status).toBe("approved");
  });

  it("reject refunds the reserved 1,000 exactly once", () => {
    let s = requestBonusWithdrawal(start(1250)).state; // 250 left
    const r1 = reviewBonusWithdrawal(s, 1, false);
    s = r1.state;
    expect(r1.result).toEqual({ kind: "rejected" });
    expect(s.total).toBe(1250);
    const r2 = reviewBonusWithdrawal(s, 1, false); // admin double click
    expect(r2.result).toEqual({ kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" });
    expect(r2.state.total).toBe(1250);
  });

  it("a reviewed request can never be reviewed again (approve then reject / reject then approve)", () => {
    const approved = reviewBonusWithdrawal(requestBonusWithdrawal(start(1000)).state, 1, true).state;
    expect(reviewBonusWithdrawal(approved, 1, false).result).toEqual({ kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" });
    expect(reviewBonusWithdrawal(approved, 1, false).state.total).toBe(0); // no refund after approval
    const rejected = reviewBonusWithdrawal(requestBonusWithdrawal(start(1000)).state, 1, false).state;
    expect(reviewBonusWithdrawal(rejected, 1, true).result).toEqual({ kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" });
  });

  it("unknown request id is an error and changes nothing", () => {
    const s = requestBonusWithdrawal(start(1000)).state;
    const r = reviewBonusWithdrawal(s, 99, true);
    expect(r.result).toEqual({ kind: "error", code: "WITHDRAWAL_NOT_FOUND" });
    expect(r.state).toBe(s);
  });

  it("after the pending request is resolved, a new one is allowed again (if the counter still has 1,000)", () => {
    let s = requestBonusWithdrawal(start(1000)).state;
    s = reviewBonusWithdrawal(s, 1, false).state; // refunded -> 1,000
    const again = requestBonusWithdrawal(s);
    expect(again.result).toEqual({ kind: "created", requestId: 2 });
    expect(again.state.total).toBe(0);
    // after approval the counter is 0 -> cannot withdraw again
    const done = reviewBonusWithdrawal(again.state, 2, true).state;
    expect(requestBonusWithdrawal(done).result).toEqual({ kind: "error", code: "BONUS_NOT_ENOUGH" });
  });

  it("invariant: the counter never goes negative and money is conserved over a random sequence", () => {
    let t = 12345;
    const rnd = (n: number) => ((t = (t * 1103515245 + 12345) & 0x7fffffff), t % n);
    let s = start(5000);
    let paid = 0;
    for (let i = 0; i < 2000; i++) {
      const pending = s.requests.find((r) => r.status === "pending");
      const roll = rnd(4);
      if (roll < 2) s = requestBonusWithdrawal(s).state;
      else if (pending) {
        const approve = roll === 2;
        s = reviewBonusWithdrawal(s, pending.id, approve).state;
        if (approve) paid += 1000;
      }
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.requests.filter((r) => r.status === "pending").length).toBeLessThanOrEqual(1);
      const reserved = s.requests.filter((r) => r.status === "pending").length * 1000;
      expect(s.total + reserved + paid).toBe(5000);
    }
  });
});
