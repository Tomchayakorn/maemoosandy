import "server-only";
import { getAdminEmails } from "@/lib/admin";
import { alertAdminError } from "@/lib/admin-alert";
import { bangkokDayRange, formatSummaryMessage, matchExcludedUsers, parseExcludeList, summarizeDay, type DailySummary, type ExpenseRow, type IncomeRow } from "@/lib/daily-summary";
import { notifyAdminLine } from "@/lib/line-notify";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = 1000;

/** Reads every row of a day window (paged, so a busy day is never cut off). */
async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

/**
 * User ids whose activity must NEVER be counted: the admins (ADMIN_EMAILS) plus any extra test accounts (SUMMARY_EXCLUDE: emails and/or user ids).
 * Fails CLOSED: if no admin can be identified, it throws, so a summary that might include the admin's own tests is never sent.
 */
export async function resolveExcludedUserIds(): Promise<Set<string>> {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) throw new Error("ADMIN_EMAILS ไม่ได้ตั้งค่า จึงแยกรายการทดสอบของแอดมินออกไม่ได้ (ไม่ส่งสรุป)");
  const entries = parseExcludeList(process.env.ADMIN_EMAILS, process.env.SUMMARY_EXCLUDE);
  const admin = createAdminClient();
  const users: { id: string; email?: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`อ่านรายชื่อผู้ใช้ไม่ได้ (${error.message}) จึงแยกรายการทดสอบของแอดมินไม่ได้ (ไม่ส่งสรุป)`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const ids = matchExcludedUsers(users, entries);
  const adminFound = matchExcludedUsers(users, adminEmails);
  if (adminFound.size === 0) throw new Error("ไม่พบบัญชีแอดมินตาม ADMIN_EMAILS ในระบบ จึงแยกรายการทดสอบไม่ได้ (ไม่ส่งสรุป)");
  return ids;
}

/** Figures of one Bangkok day straight from the database (see daily-summary.ts for the exact definitions). */
export async function computeDailySummary(date: string): Promise<DailySummary> {
  const admin = createAdminClient();
  const { start, end } = bangkokDayRange(date);
  const [excluded, income, expense] = await Promise.all([
    resolveExcludedUserIds(),
    readAll<IncomeRow>((from, to) =>
      admin
        .from("transactions")
        .select("user_id, amount_thb, status, provider, created_at, package_id, coins_added, slip_ref")
        .eq("status", "success")
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at")
        .range(from, to),
    ),
    readAll<ExpenseRow>((from, to) =>
      admin
        .from("withdrawal_requests")
        .select("user_id, amount_thb, status, source, reviewed_at")
        .eq("status", "approved")
        .gte("reviewed_at", start.toISOString())
        .lt("reviewed_at", end.toISOString())
        .order("reviewed_at")
        .range(from, to),
    ),
  ]);
  return summarizeDay(date, income, expense, excluded);
}

export type DailySummaryOutcome =
  | { status: "sent"; summary: DailySummary }
  | { status: "skipped"; reason: "already_sent_or_in_progress" }
  | { status: "failed"; reason: string; summary?: DailySummary };

/**
 * Compute → claim the date in the database (so the same day is never sent twice, even with parallel runs) → push to LINE → record the result.
 * Never throws: every failure is returned (and the admin is alerted when LINE itself is still reachable).
 */
export async function sendDailySummary(date: string): Promise<DailySummaryOutcome> {
  const admin = createAdminClient();
  let summary: DailySummary | undefined;
  try {
    summary = await computeDailySummary(date);

    const claim = await admin.rpc("claim_daily_summary", { p_date: date });
    if (claim.error) {
      // most likely migration 0018 isn't installed: without the guard we do NOT send (a duplicate would be possible)
      await alertAdminError({ where: "daily summary: claim_daily_summary (ต้องรัน migration 0018)", error: claim.error });
      return { status: "failed", reason: "claim_failed", summary };
    }
    if (claim.data !== true) return { status: "skipped", reason: "already_sent_or_in_progress" };

    let ok = false;
    let error: string | null = null;
    try {
      ok = await notifyAdminLine(formatSummaryMessage(summary)); // never throws
      if (!ok) error = "LINE push failed or LINE keys are missing";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const finish = await admin.rpc("finish_daily_summary", {
      p_date: date,
      p_ok: ok,
      p_income_thb: summary.income.thb,
      p_income_count: summary.income.count,
      p_expense_thb: summary.expense.thb,
      p_expense_count: summary.expense.count,
      p_error: error,
    });
    if (finish.error) console.error("finish_daily_summary failed", finish.error.message);
    return ok ? { status: "sent", summary } : { status: "failed", reason: error ?? "unknown", summary };
  } catch (e) {
    console.error("daily summary failed", e);
    await alertAdminError({ where: `daily summary (${date})`, error: e });
    return { status: "failed", reason: e instanceof Error ? e.message : String(e), summary };
  }
}
