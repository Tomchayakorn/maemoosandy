/**
 * "ยอดสะสมจากการหมุนเกม" (wheel cash tally) — client-safe constants + pure rules.
 * Separate from the main wallet: every PAID, non-jackpot spin that wins coins adds WHEEL_CASH_PCT % of the prize to
 * wallets.wheel_cash_total (the coins themselves still go to the wallet in full). The tally is a withdrawal ticket:
 *   - small tier: WHEEL_CASH_SMALL tally coins = WHEEL_CASH_SMALL THB, limited to perDay / perWeek requests per player
 *   - big tier:   WHEEL_CASH_BIG tally coins = WHEEL_CASH_BIG THB, no daily/weekly quota (the admin approves each one)
 * Free-ticket spins and the jackpot never add to it. The 1,000 / 5,000-coin JACKPOT withdrawal is a different, existing flow.
 * Mirrors the SQL functions `spin_wheel_cycle` and `request_wheel_cash_withdrawal` (migration 0013); the database is the
 * source of truth (wallet row lock) — this file keeps the rules testable and drives the UI.
 */
export const WHEEL_CASH_PCT = 25;
export const WHEEL_CASH_SMALL = 500;
export const WHEEL_CASH_BIG = 5000;
export const WHEEL_CASH_LIMITS = { perDay: 1, perWeek: 3 } as const;
export type WheelCashTier = typeof WHEEL_CASH_SMALL | typeof WHEEL_CASH_BIG;

/** Tally coins earned by one winning paid spin (floor, same as the SQL integer division). */
export function cashCredit(prizeCoins: number, pct = WHEEL_CASH_PCT): number {
  return Math.floor((Math.max(0, prizeCoins) * pct) / 100);
}

export type CashRequestRow = { amount_thb: number; status: "pending" | "approved" | "rejected"; created_at: string };

const HOUR = 3_600_000;
const BANGKOK_OFFSET = 7 * HOUR; // Asia/Bangkok has no DST

/** Start (UTC instant) of the current Bangkok calendar day. */
export function bangkokDayStart(now: Date): Date {
  const local = now.getTime() + BANGKOK_OFFSET;
  return new Date(Math.floor(local / (24 * HOUR)) * 24 * HOUR - BANGKOK_OFFSET);
}

/** Start (UTC instant) of the current Bangkok week (Monday 00:00), like date_trunc('week') in Asia/Bangkok. */
export function bangkokWeekStart(now: Date): Date {
  const dayStart = bangkokDayStart(now);
  const dow = (new Date(dayStart.getTime() + BANGKOK_OFFSET).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(dayStart.getTime() - dow * 24 * HOUR);
}

/** Small-tier requests that count against the quota (pending + approved; a rejected one frees its slot). */
export function smallTierUsage(rows: readonly CashRequestRow[], now: Date): { day: number; week: number } {
  const d = bangkokDayStart(now).getTime();
  const w = bangkokWeekStart(now).getTime();
  let day = 0;
  let week = 0;
  for (const r of rows) {
    if (r.amount_thb !== WHEEL_CASH_SMALL || r.status === "rejected") continue;
    const t = new Date(r.created_at).getTime();
    if (t >= d) day++;
    if (t >= w) week++;
  }
  return { day, week };
}

export type CashUiState = {
  /** a request is waiting for the admin: nothing else can be requested */
  pending: boolean;
  small: { ready: boolean; remaining: number; blocked: null | "pending" | "day" | "week" };
  big: { ready: boolean; remaining: number; blocked: null | "pending" };
  dayLeft: number;
  weekLeft: number;
};

/** What the UI shows. The server re-checks everything under the wallet lock. */
export function cashUiState(total: number, pending: boolean, usage: { day: number; week: number }): CashUiState {
  const dayLeft = Math.max(0, WHEEL_CASH_LIMITS.perDay - usage.day);
  const weekLeft = Math.max(0, WHEEL_CASH_LIMITS.perWeek - usage.week);
  const smallEnough = total >= WHEEL_CASH_SMALL;
  const bigEnough = total >= WHEEL_CASH_BIG;
  return {
    pending,
    dayLeft,
    weekLeft,
    small: {
      ready: smallEnough && !pending && dayLeft > 0 && weekLeft > 0,
      remaining: Math.max(0, WHEEL_CASH_SMALL - total),
      blocked: pending ? "pending" : dayLeft <= 0 ? "day" : weekLeft <= 0 ? "week" : null,
    },
    big: { ready: bigEnough && !pending, remaining: Math.max(0, WHEEL_CASH_BIG - total), blocked: pending ? "pending" : null },
  };
}

// ───── reference model of request_wheel_cash_withdrawal / review (migration 0013) ─────
export type CashModelRequest = { id: number; tier: WheelCashTier; status: "pending" | "approved" | "rejected"; at: Date; reserved: boolean };
export type CashModelState = { total: number; requests: CashModelRequest[] };
export type CashRequestResult =
  | { kind: "created" | "already_pending"; requestId: number }
  | { kind: "error"; code: "WHEEL_CASH_NOT_ENOUGH" | "WHEEL_CASH_DAILY_LIMIT" | "WHEEL_CASH_WEEKLY_LIMIT" | "INVALID_TIER" };

export function requestCashWithdrawal(s: CashModelState, tier: number, now: Date): { state: CashModelState; result: CashRequestResult } {
  if (tier !== WHEEL_CASH_SMALL && tier !== WHEEL_CASH_BIG) return { state: s, result: { kind: "error", code: "INVALID_TIER" } };
  const pending = s.requests.find((r) => r.status === "pending");
  if (pending) return { state: s, result: { kind: "already_pending", requestId: pending.id } }; // idempotent: nothing reserved twice
  if (s.total < tier) return { state: s, result: { kind: "error", code: "WHEEL_CASH_NOT_ENOUGH" } };
  if (tier === WHEEL_CASH_SMALL) {
    const usage = smallTierUsage(
      s.requests.filter((r) => r.tier === WHEEL_CASH_SMALL).map((r) => ({ amount_thb: r.tier, status: r.status, created_at: r.at.toISOString() })),
      now,
    );
    if (usage.day >= WHEEL_CASH_LIMITS.perDay) return { state: s, result: { kind: "error", code: "WHEEL_CASH_DAILY_LIMIT" } };
    if (usage.week >= WHEEL_CASH_LIMITS.perWeek) return { state: s, result: { kind: "error", code: "WHEEL_CASH_WEEKLY_LIMIT" } };
  }
  const id = s.requests.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return {
    state: { total: s.total - tier, requests: [...s.requests, { id, tier: tier as WheelCashTier, status: "pending", at: now, reserved: true }] },
    result: { kind: "created", requestId: id },
  };
}

export function reviewCashWithdrawal(
  s: CashModelState,
  id: number,
  approve: boolean,
): { state: CashModelState; result: { kind: "approved" | "rejected" } | { kind: "error"; code: "WITHDRAWAL_NOT_FOUND" | "WITHDRAWAL_ALREADY_REVIEWED" } } {
  const req = s.requests.find((r) => r.id === id);
  if (!req) return { state: s, result: { kind: "error", code: "WITHDRAWAL_NOT_FOUND" } };
  if (req.status !== "pending") return { state: s, result: { kind: "error", code: "WITHDRAWAL_ALREADY_REVIEWED" } };
  const refund = !approve && req.reserved ? req.tier : 0;
  return {
    state: {
      total: s.total + refund,
      requests: s.requests.map((r) => (r.id !== id ? r : { ...r, status: approve ? "approved" : "rejected", reserved: approve ? r.reserved : false })),
    },
    result: { kind: approve ? "approved" : "rejected" },
  };
}
