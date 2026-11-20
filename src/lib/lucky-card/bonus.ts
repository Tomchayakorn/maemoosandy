/** Client-safe helpers for the accumulated-bonus cash-out (target 1,000 coins -> 1,000 THB). Display only: the server decides. */
export const BONUS_TARGET = 1000;
export const BONUS_WITHDRAW_THB = 1000;

/** 0..1 for the progress bar (capped at full). */
export function bonusProgress(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, total / BONUS_TARGET);
}

export type BonusWithdrawState =
  | { kind: "pending" } // a request is waiting for the admin
  | { kind: "ready" } // total >= target and nothing pending
  | { kind: "locked"; remaining: number }; // keep collecting

export function bonusWithdrawState(total: number, pending: boolean): BonusWithdrawState {
  if (pending) return { kind: "pending" };
  if (total >= BONUS_TARGET) return { kind: "ready" };
  return { kind: "locked", remaining: BONUS_TARGET - Math.max(0, total) };
}
