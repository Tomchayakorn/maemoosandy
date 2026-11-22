import "server-only";
import { notifyAdminLine } from "@/lib/line-notify";

/**
 * Error alerts to the admin's LINE chat (Messaging API push, via notifyAdminLine which needs LINE_CHANNEL_ACCESS_TOKEN + LINE_ADMIN_USER_ID).
 * Only REAL server errors are sent — never normal play and never expected rejections (not enough coins, already played today, ...).
 * Everything here is wrapped in its own try/catch: a failed alert can never break the request that raised it.
 */

/** Codes that are normal, user-level outcomes: no alert. */
const EXPECTED_CODES = [
  "INSUFFICIENT_COINS", "ALREADY_PLAYED_TODAY", "NOTHING_TO_RESET", "NO_SPIN_TICKETS",
  "VOUCHER_NOT_FOUND", "VOUCHER_DISABLED", "VOUCHER_EXPIRED", "VOUCHER_ALREADY_USED", "VOUCHER_FULL",
  "ACTIVE_ROUND_EXISTS", "ROUND_NOT_ACTIVE", "ROUND_NOT_FOUND", "TILE_ALREADY_OPENED", "NO_SAFE_TILE",
] as const;

type ErrorLike = { message?: string; code?: string; details?: string | null; hint?: string | null } | Error | string | null | undefined;

/** True for a real server-side failure (unknown error, missing function/table, data problem), false for expected rejections. */
export function shouldAlertRpcError(error: ErrorLike): boolean {
  if (!error) return false;
  const message = typeof error === "string" ? error : (error.message ?? "");
  return !EXPECTED_CODES.some((c) => message.includes(c));
}

/** One short line describing an error (no stack, no secrets), at most 300 characters. */
export function describeError(error: unknown): string {
  let text: string;
  if (typeof error === "string") text = error;
  else if (error instanceof Error) text = `${error.name}: ${error.message}`;
  else if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string | null; hint?: string | null };
    text = [e.code ? `[${e.code}]` : "", e.message ?? "", e.details ?? "", e.hint ? `hint: ${e.hint}` : ""].filter(Boolean).join(" ") || JSON.stringify(error);
  } else text = String(error);
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Thai time (Asia/Bangkok), e.g. "22/11/2026 14:03:11". */
export function bangkokTimestamp(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
    .format(now)
    .replace(",", "");
}

export function formatAdminAlert(opts: { where: string; userId?: string | null; error: unknown; now?: Date; extra?: string }): string {
  return [
    "⚠️ ERROR ระบบ น้องเหมียว 9 ชีวิต",
    `เวลา: ${bangkokTimestamp(opts.now ?? new Date())} (เวลาไทย)`,
    `จุดที่พัง: ${opts.where}`,
    `User ID: ${opts.userId || "-"}`,
    ...(opts.extra ? [opts.extra] : []),
    `Error: ${describeError(opts.error)}`,
  ].join("\n");
}

// Same failure repeated (e.g. a missing migration hit by every player) is sent at most once per window, so LINE is not flooded.
const DEDUPE_MS = 5 * 60_000;
const recent = new Map<string, number>();

export async function alertAdminError(opts: { where: string; userId?: string | null; error: unknown; extra?: string }): Promise<void> {
  try {
    const now = Date.now();
    const key = `${opts.where}|${describeError(opts.error)}`;
    const last = recent.get(key);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    if (recent.size > 200) for (const [k, t] of recent) if (now - t >= DEDUPE_MS) recent.delete(k);
    await notifyAdminLine(formatAdminAlert({ ...opts, now: new Date(now) }));
  } catch (e) {
    console.error("alertAdminError failed (ignored)", e);
  }
}

/** Test helper. */
export function _resetAdminAlertDedupe(): void {
  recent.clear();
}
