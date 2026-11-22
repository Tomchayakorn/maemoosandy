import { findPackage } from "./packages";
import { WITHDRAW_SOURCE_LABEL, type WithdrawSource } from "./withdrawals";

/**
 * Daily income / expense summary — pure logic (no database, no LINE), so it is unit-tested.
 *
 * INCOME  = public.transactions rows with status = 'success' whose created_at falls in the Bangkok day.
 *           (credit_topup inserts the row directly as 'success' when the slip is verified, so created_at IS the confirmation time;
 *            failed / rejected attempts are never income. Only a NORMAL slip top-up counts (isRealSlipTopup): a real slip provider
 *            (thunder / easyslip / slipok, never 'mock' or a manual / null provider), a slip_ref, a known package whose price equals the amount and
 *            whose coins equal coins_added. Anything else (test amounts, manual credits, mock) is "abnormal" and never counted.)
 * EXPENSE = public.withdrawal_requests rows with status = 'approved' whose reviewed_at (the admin's "โอนเงินแล้ว" click) falls in the Bangkok day,
 *           all sources (jackpot, lucky_card, lucky_card_bonus, wheel_cash). Pending and rejected requests are not expense.
 * NEVER COUNTED: anything done by an admin / test account (the admin's own tests). Rows of those user ids are dropped from BOTH sides
 *           (`excludedUserIds`), and the number of dropped rows is reported so nothing disappears silently.
 */
const HOUR = 3_600_000;
const BANGKOK_OFFSET = 7 * HOUR; // Asia/Bangkok has no DST

export type IncomeRow = {
  user_id: string;
  amount_thb: number | string;
  status: string;
  provider: string | null;
  created_at: string;
  package_id?: string | null;
  coins_added?: number | null;
  slip_ref?: string | null;
};

/** The slip providers the server really uses (src/lib/slip). 'mock' is the dev-only fake and is deliberately not here. */
export const REAL_SLIP_PROVIDERS = ["thunder", "easyslip", "slipok"] as const;

/** A top-up that went through the normal slip flow with an exact package amount (so no test / manual / odd-amount credit). */
export function isRealSlipTopup(r: IncomeRow): boolean {
  if (!r.provider || !(REAL_SLIP_PROVIDERS as readonly string[]).includes(r.provider)) return false;
  if (!r.slip_ref) return false;
  const pkg = r.package_id ? findPackage(r.package_id) : undefined;
  if (!pkg) return false;
  return Number(r.amount_thb) === pkg.priceThb && r.coins_added === pkg.coins;
}
export type ExpenseRow = { user_id: string; amount_thb: number | string; status: string; source: string | null; reviewed_at: string | null };

/** Bangkok calendar date (YYYY-MM-DD) of an instant. */
export function bangkokDateOf(now: Date): string {
  return new Date(now.getTime() + BANGKOK_OFFSET).toISOString().slice(0, 10);
}

/** The Bangkok date before the one `now` falls in — what the 00:05 run summarises. */
export function previousBangkokDate(now: Date): string {
  return bangkokDateOf(new Date(now.getTime() - 24 * HOUR));
}

/** [start, end) of a Bangkok calendar day as UTC instants. */
export function bangkokDayRange(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - BANGKOK_OFFSET);
  return { start, end: new Date(start.getTime() + 24 * HOUR) };
}

export type DailySummary = {
  date: string;
  /** rows left out (not in any figure below): admin / test accounts and abnormal top-ups; `abnormalIncome` = those left out for being abnormal */
  excluded: { income: number; expense: number; abnormalIncome: number };
  income: { thb: number; count: number; users: number };
  expense: { thb: number; count: number; users: number; bySource: { source: string; thb: number; count: number }[] };
  net: number;
};

const inRange = (iso: string | null, start: Date, end: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeDay(
  date: string,
  incomeRows: readonly IncomeRow[],
  expenseRows: readonly ExpenseRow[],
  excludedUserIds: ReadonlySet<string> = new Set(),
): DailySummary {
  const { start, end } = bangkokDayRange(date);
  const incAll = incomeRows.filter((r) => r.status === "success" && inRange(r.created_at, start, end));
  const expAll = expenseRows.filter((r) => r.status === "approved" && inRange(r.reviewed_at, start, end));
  // the admin's own tests are never counted, on either side
  const inc = incAll.filter((r) => isRealSlipTopup(r) && !excludedUserIds.has(r.user_id));
  const exp = expAll.filter((r) => !excludedUserIds.has(r.user_id));

  const bySource = new Map<string, { thb: number; count: number }>();
  for (const r of exp) {
    const key = r.source ?? "jackpot";
    const cur = bySource.get(key) ?? { thb: 0, count: 0 };
    cur.thb += Number(r.amount_thb);
    cur.count += 1;
    bySource.set(key, cur);
  }
  const incomeThb = round2(inc.reduce((s, r) => s + Number(r.amount_thb), 0));
  const expenseThb = round2(exp.reduce((s, r) => s + Number(r.amount_thb), 0));
  return {
    date,
    excluded: { income: incAll.length - inc.length, expense: expAll.length - exp.length, abnormalIncome: incAll.filter((r) => !isRealSlipTopup(r)).length },
    income: { thb: incomeThb, count: inc.length, users: new Set(inc.map((r) => r.user_id)).size },
    expense: {
      thb: expenseThb,
      count: exp.length,
      users: new Set(exp.map((r) => r.user_id)).size,
      bySource: [...bySource].map(([source, v]) => ({ source, thb: round2(v.thb), count: v.count })).sort((a, b) => b.thb - a.thb),
    },
    net: round2(incomeThb - expenseThb),
  };
}

const money = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "22 พ.ย. 2569" for a Bangkok date string. */
export function thaiDateLabel(date: string): string {
  const { start } = bangkokDayRange(date);
  return start.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
}

/** The LINE text. Short lines so it reads well on a phone. */
export function formatSummaryMessage(s: DailySummary): string {
  const sourceLabel = (k: string) => {
    const full = (WITHDRAW_SOURCE_LABEL as Record<string, string>)[k as WithdrawSource] ?? k;
    return full.replace(/\s*\(.*\)\s*$/, ""); // drop the long "(5,000 เหรียญ = …)" tail
  };
  const lines = [
    "📊 สรุปรายรับ-รายจ่าย ประจำวัน",
    `วันที่ ${thaiDateLabel(s.date)} (เวลาไทย 00:00–23:59)`,
    "",
    "💰 รายรับ (ยอดสลิปเติมที่ยืนยันแล้ว)",
    `${money(s.income.thb)}`,
    `${s.income.count} รายการ · ${s.income.users} ผู้เล่น`,
    "",
    "💸 รายจ่าย (ยอดสลิปโอนกลับที่กดยืนยันแล้ว)",
    `${money(s.expense.thb)}`,
    `${s.expense.count} รายการ · ${s.expense.users} ผู้เล่น`,
    ...s.expense.bySource.map((b) => `  • ${sourceLabel(b.source)}: ${money(b.thb)} (${b.count})`),
    "",
    `📈 ผลต่างสุทธิ (รายรับ − รายจ่าย)`,
    `${s.net >= 0 ? "+" : "−"}${money(Math.abs(s.net))}`,
    "",
    "ℹ️ ไม่รวมรายการทดสอบของแอดมิน/บัญชีทดสอบ/รายการผิดปกติ" + (s.excluded.income + s.excluded.expense > 0 ? ` (ตัดออก ${s.excluded.income + s.excluded.expense} รายการ)` : ""),
  ];
  return lines.join("\n");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses a comma-separated list of emails and/or user ids (lower-cased, de-duplicated). */
export function parseExcludeList(...lists: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const l of lists) for (const e of (l ?? "").split(",")) if (e.trim()) out.add(e.trim().toLowerCase());
  return [...out];
}

/** Ids of the auth users whose email (or id) is in the exclusion list. Entries that are not users simply match nothing. */
export function matchExcludedUsers(users: readonly { id: string; email?: string | null }[], entries: readonly string[]): Set<string> {
  const emails = new Set(entries.filter((e) => !UUID.test(e)));
  const ids = new Set(entries.filter((e) => UUID.test(e)));
  const out = new Set<string>();
  for (const u of users) {
    if ((u.email && emails.has(u.email.toLowerCase())) || ids.has(u.id.toLowerCase())) out.add(u.id);
  }
  return out;
}
