import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { createAdminClient } from "./supabase/admin";
import { WITHDRAW_COINS, WITHDRAW_THB } from "./withdrawals";

/**
 * DEVELOPMENT-ONLY fallback for databases where migration 0005 has not been run (no
 * `wallets.jackpot_withdrawals_available` column, no `withdrawal_requests` table).
 * Quota + requests live in `.data/withdrawals.json`; the 5,000-coin charge/refund is a compare-and-swap on `wallets`.
 * Disabled when NODE_ENV=production (a file is not shared across serverless instances) — run 0005 there.
 */
type Admin = ReturnType<typeof createAdminClient>;

export type LocalRequest = {
  id: string;
  user_id: string;
  user_email: string | null;
  amount_coins: number;
  amount_thb: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
type Store = { quota: Record<string, number>; requests: LocalRequest[] };

const FILE = path.join(process.cwd(), ".data", "withdrawals.json");
export const localFallbackEnabled = () => process.env.NODE_ENV !== "production";

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function load(): Promise<Store> {
  try {
    const s = JSON.parse(await readFile(FILE, "utf8")) as Partial<Store>;
    return { quota: s.quota ?? {}, requests: s.requests ?? [] };
  } catch {
    return { quota: {}, requests: [] };
  }
}
async function save(s: Store) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2));
  await rename(tmp, FILE);
}

/** True when the live DB lacks migration 0005 AND the dev fallback may be used. */
let cached: { at: number; missing: boolean } | null = null;
export async function shouldUseLocalWithdrawals(admin: Admin): Promise<boolean> {
  if (!localFallbackEnabled()) return false;
  if (cached && Date.now() - cached.at < 15_000) return cached.missing;
  const { error } = await admin.from("wallets").select("jackpot_withdrawals_available").limit(1);
  cached = { at: Date.now(), missing: !!error };
  return cached.missing;
}

export async function getLocalQuota(userId: string) {
  return (await load()).quota[userId] ?? 0;
}
export function grantLocalQuota(userId: string, n = 1) {
  return serial(async () => {
    const s = await load();
    s.quota[userId] = (s.quota[userId] ?? 0) + n;
    await save(s);
    return s.quota[userId];
  });
}
export async function listLocalRequests(userId?: string) {
  const all = (await load()).requests;
  return (userId ? all.filter((r) => r.user_id === userId) : all).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function casWallet(admin: Admin, userId: string, delta: number): Promise<number | "INSUFFICIENT_COINS" | "ERROR"> {
  for (let i = 0; i < 8; i++) {
    const { data: w } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
    if (!w) return "ERROR";
    if (w.balance + delta < 0) return "INSUFFICIENT_COINS";
    const { data: u } = await admin.from("wallets").update({ balance: w.balance + delta }).eq("user_id", userId).eq("balance", w.balance).select("balance");
    if (u?.length === 1) return u[0].balance;
  }
  return "ERROR";
}

export function createLocalRequest(
  admin: Admin,
  user: { id: string; email?: string | null },
  b: { bankName: string; accountNumber: string; accountName: string },
) {
  return serial(async () => {
    const s = await load();
    if ((s.quota[user.id] ?? 0) < 1) return { error: "NO_WITHDRAWAL_QUOTA" as const };
    const bal = await casWallet(admin, user.id, -WITHDRAW_COINS);
    if (typeof bal !== "number") return { error: bal };
    s.quota[user.id] -= 1;
    const row: LocalRequest = {
      id: randomUUID(),
      user_id: user.id,
      user_email: user.email ?? null,
      amount_coins: WITHDRAW_COINS,
      amount_thb: WITHDRAW_THB,
      bank_name: b.bankName,
      account_number: b.accountNumber,
      account_name: b.accountName,
      status: "pending",
      created_at: new Date().toISOString(),
      reviewed_by: null,
      reviewed_at: null,
    };
    s.requests.push(row);
    await save(s);
    return { requestId: row.id, balance: bal, quota: s.quota[user.id] };
  });
}

export function reviewLocalRequest(admin: Admin, id: string, approve: boolean, reviewer: string) {
  return serial(async () => {
    const s = await load();
    const r = s.requests.find((x) => x.id === id);
    if (!r) return { error: "WITHDRAWAL_NOT_FOUND" as const };
    if (r.status !== "pending") return { error: "WITHDRAWAL_ALREADY_REVIEWED" as const };
    if (!approve) {
      const bal = await casWallet(admin, r.user_id, r.amount_coins);
      if (typeof bal !== "number") return { error: "ERROR" as const };
      s.quota[r.user_id] = (s.quota[r.user_id] ?? 0) + 1;
    }
    r.status = approve ? "approved" : "rejected";
    r.reviewed_by = reviewer;
    r.reviewed_at = new Date().toISOString();
    await save(s);
    return { status: r.status };
  });
}
