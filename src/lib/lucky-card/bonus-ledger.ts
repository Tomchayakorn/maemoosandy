import { BONUS_TARGET } from "./bonus";

/**
 * Reference model of the accumulated-bonus cash-out rules implemented by the SQL functions
 * `request_lucky_card_bonus_withdrawal` and `review_jackpot_withdrawal` (migration 0009).
 * The database is the source of truth (it serialises everything with the wallet row lock and a partial unique index);
 * this pure model keeps the rules unit-testable. Every call below corresponds to ONE locked transaction, so "two tabs
 * at once" is simply two calls in a row.
 *
 *  request: pending request exists -> return it, reserve nothing | total < 1,000 -> error | else total -= 1,000 (reserved)
 *  approve: status only (coins were already reserved)
 *  reject:  total += 1,000 back (only if reserved), status = rejected
 */
export type BonusRequest = { id: number; status: "pending" | "approved" | "rejected"; reserved: boolean };
export type BonusState = { total: number; requests: BonusRequest[] };

export type RequestResult =
  | { kind: "created"; requestId: number }
  | { kind: "already_pending"; requestId: number }
  | { kind: "error"; code: "BONUS_NOT_ENOUGH" };

export type ReviewResult =
  | { kind: "approved" | "rejected" }
  | { kind: "error"; code: "WITHDRAWAL_NOT_FOUND" | "WITHDRAWAL_ALREADY_REVIEWED" };

export function requestBonusWithdrawal(s: BonusState): { state: BonusState; result: RequestResult } {
  const pending = s.requests.find((r) => r.status === "pending");
  if (pending) return { state: s, result: { kind: "already_pending", requestId: pending.id } };
  if (s.total < BONUS_TARGET) return { state: s, result: { kind: "error", code: "BONUS_NOT_ENOUGH" } };
  const id = s.requests.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return {
    state: { total: s.total - BONUS_TARGET, requests: [...s.requests, { id, status: "pending", reserved: true }] },
    result: { kind: "created", requestId: id },
  };
}

export function reviewBonusWithdrawal(s: BonusState, id: number, approve: boolean): { state: BonusState; result: ReviewResult } {
  const req = s.requests.find((r) => r.id === id);
  if (!req) return { state: s, result: { kind: "error", code: "WITHDRAWAL_NOT_FOUND" } };
  if (req.status !== "pending") return { state: s, result: { kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" } };
  const requests = s.requests.map((r) =>
    r.id !== id ? r : approve ? { ...r, status: "approved" as const } : { ...r, status: "rejected" as const, reserved: false },
  );
  const refund = !approve && req.reserved ? BONUS_TARGET : 0;
  return { state: { total: s.total + refund, requests }, result: { kind: approve ? "approved" : "rejected" } };
}
