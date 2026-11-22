/**
 * "โค้ดลับจากแม่มู" — client-safe helpers and the reference model of the SQL (migration 0019). The database is the source of truth.
 */
export const VOUCHER_COINS_MAX = 10_000;
export const VOUCHER_USES_MAX = 10_000;
export const VOUCHER_CODE_MIN = 4;
export const VOUCHER_CODE_MAX = 24;
const CODE_RE = /^[A-Z0-9-]{4,24}$/;

/**
 * What a player types → the code that is looked up: trimmed, ALL whitespace and invisible characters removed, full-width letters/digits
 * folded to ASCII, upper-cased. (The server runs the same function and the SQL does its own upper()/whitespace strip.)
 */
export function normalizeVoucherCode(input: string): string {
  return input
    .normalize("NFKC") // full-width → ASCII (ＡＢＣ１２３ → ABC123), also unifies dashes
    .replace(/[\s​-‍﻿]/g, "")
    .replace(/[‐‑‒–—−]/g, "-")
    .toUpperCase();
}

export function isValidVoucherCode(code: string): boolean {
  return CODE_RE.test(code);
}

/** Code characters without look-alikes (no 0/O, 1/I/L), for generated codes. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateVoucherCode(rand: (maxExclusive: number) => number, length = 8): string {
  return Array.from({ length }, () => ALPHABET[rand(ALPHABET.length)]).join("");
}

export type VoucherRow = { is_active: boolean; expires_at: string; max_redemptions: number; redeemed_count: number };
export type VoucherStatus = "active" | "disabled" | "expired" | "full";

/** Admin list status (same precedence as redeem_voucher: disabled, expired, then full). */
export function voucherStatus(v: VoucherRow, now: Date): VoucherStatus {
  if (!v.is_active) return "disabled";
  if (new Date(v.expires_at).getTime() <= now.getTime()) return "expired";
  if (v.redeemed_count >= v.max_redemptions) return "full";
  return "active";
}

export const VOUCHER_STATUS_LABEL: Record<VoucherStatus, string> = {
  active: "ใช้งานได้",
  disabled: "ปิดอยู่",
  expired: "หมดอายุ",
  full: "สิทธิ์เต็มแล้ว",
};

/** Admin form: a `datetime-local` value ("2026-11-23T20:00") is Bangkok time → the UTC instant (Asia/Bangkok = UTC+7, no DST). */
export function bangkokLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  const t = Date.UTC(y, mo - 1, d, h, mi) - 7 * 3_600_000;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// ---- reference model of redeem_voucher (what the SQL guarantees) ----
export type VoucherModelState = {
  voucher: (VoucherRow & { code: string; coins: number }) | null;
  redeemedBy: string[];
  balances: Record<string, number>;
  ledger: { user: string; reason: "voucher"; coins: number }[];
};
export type RedeemModelResult =
  | { ok: true; state: VoucherModelState; coins: number; balance: number }
  | { ok: false; error: "VOUCHER_NOT_FOUND" | "VOUCHER_DISABLED" | "VOUCHER_EXPIRED" | "VOUCHER_ALREADY_USED" | "VOUCHER_FULL" };

export function redeemModel(state: VoucherModelState, user: string, input: string, now: Date): RedeemModelResult {
  const v = state.voucher;
  if (!v || normalizeVoucherCode(input) !== v.code) return { ok: false, error: "VOUCHER_NOT_FOUND" };
  if (!v.is_active) return { ok: false, error: "VOUCHER_DISABLED" };
  if (new Date(v.expires_at).getTime() <= now.getTime()) return { ok: false, error: "VOUCHER_EXPIRED" };
  if (state.redeemedBy.includes(user)) return { ok: false, error: "VOUCHER_ALREADY_USED" };
  if (v.redeemed_count >= v.max_redemptions) return { ok: false, error: "VOUCHER_FULL" };
  const balance = (state.balances[user] ?? 0) + v.coins;
  return {
    ok: true,
    coins: v.coins,
    balance,
    state: {
      voucher: { ...v, redeemed_count: v.redeemed_count + 1 },
      redeemedBy: [...state.redeemedBy, user],
      balances: { ...state.balances, [user]: balance },
      ledger: [...state.ledger, { user, reason: "voucher", coins: v.coins }],
    },
  };
}
