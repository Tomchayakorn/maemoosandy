/**
 * Our own rules applied to every slip, whichever provider read it.
 * Pure (no I/O) so it's unit-tested.
 */
import type { SlipData, SlipErrorCode } from "./types";

export type ReceiverConfig = {
  /** Expected receiver name (as registered with the bank), e.g. "นาง แซนดี้ ณ มัณตรา". */
  name: string | null;
  /** Expected account / PromptPay number; only the digits are compared. */
  account: string | null;
};

export type CheckOptions = {
  expectedAmount: number;
  receiver: ReceiverConfig;
  now: Date;
  maxAgeHours: number;
};

export type CheckResult = { ok: true } | { ok: false; code: SlipErrorCode; detail: string };

const TITLE_RE = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i;

/** Lower-case, drop titles, punctuation and spaces: "นาง แซนดี้ ณ." → "แซนดี้ณ". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .trim()
    .replace(TITLE_RE, "")
    .toLowerCase()
    .replace(/[\s.\-_,'"]/g, "");
}

/**
 * Slips usually print a shortened name ("แซนดี้ ณ" or "SANDY N"). Accept when the
 * slip's first name matches ours and, if the slip shows a surname initial, it
 * agrees with our surname.
 */
export function receiverNameMatches(slipName: string, expected: string): boolean {
  const slipParts = slipName.normalize("NFC").trim().replace(TITLE_RE, "").split(/\s+/).filter(Boolean);
  const expParts = expected.normalize("NFC").trim().replace(TITLE_RE, "").split(/\s+/).filter(Boolean);
  if (!slipParts.length || !expParts.length) return false;

  const slipFirst = normalizeName(slipParts[0]);
  const expFirst = normalizeName(expParts[0]);
  if (!slipFirst || !(expFirst.startsWith(slipFirst) || slipFirst.startsWith(expFirst))) return false;

  const slipRest = normalizeName(slipParts.slice(1).join(""));
  const expRest = normalizeName(expParts.slice(1).join(""));
  if (!slipRest || !expRest) return true;
  return expRest.startsWith(slipRest) || slipRest.startsWith(expRest);
}

/**
 * Masked numbers keep a few real digits ("xxx-x-x3109-x", "086xxx0000").
 * Accept when every visible digit run on the slip appears, in order, at the
 * same place in our number.
 */
export function receiverAccountMatches(slipAccount: string, expected: string): boolean {
  const exp = expected.replace(/\D/g, "");
  const masked = slipAccount.replace(/[^0-9xX*]/g, "").toLowerCase().replace(/\*/g, "x");
  if (!exp || !masked) return false;
  const visible = masked.replace(/x/g, "");
  if (visible.length < 3) return false; // too masked to tell

  // Same length: compare position by position.
  if (masked.length === exp.length) {
    return [...masked].every((c, i) => c === "x" || c === exp[i]);
  }
  // Phone numbers can be shown as 0XX… or 66XX…; compare the visible tail.
  const tail = masked.match(/\d+$/)?.[0] ?? "";
  return tail.length >= 3 && exp.endsWith(tail);
}

export function checkSlip(slip: SlipData, opts: CheckOptions): CheckResult {
  // 1) Amount must match the package exactly (satang-safe).
  if (Math.round(slip.amount * 100) !== Math.round(opts.expectedAmount * 100)) {
    return { ok: false, code: "AMOUNT_MISMATCH", detail: `slip ${slip.amount} ≠ expected ${opts.expectedAmount}` };
  }

  // 2) Receiver must be us.
  if (slip.receiverMatched === false) {
    return { ok: false, code: "RECEIVER_MISMATCH", detail: "provider: receiver not a registered account" };
  }
  if (slip.receiverMatched !== true) {
    // Without a configured receiver we can't tell a payment to us from a transfer to anyone else.
    if (!opts.receiver.account && !opts.receiver.name) {
      return { ok: false, code: "NOT_CONFIGURED", detail: "PROMPTPAY_RECEIVER_NAME / PROMPTPAY_RECEIVER_ACCOUNT not set" };
    }
    const checks: boolean[] = [];
    if (opts.receiver.account && slip.receiverAccount) checks.push(receiverAccountMatches(slip.receiverAccount, opts.receiver.account));
    if (opts.receiver.name && slip.receiverName) checks.push(receiverNameMatches(slip.receiverName, opts.receiver.name));
    if (checks.length === 0) {
      return { ok: false, code: "RECEIVER_MISMATCH", detail: "slip has no receiver details to compare" };
    }
    if (checks.includes(false)) {
      return { ok: false, code: "RECEIVER_MISMATCH", detail: `slip receiver "${slip.receiverName ?? ""}" / "${slip.receiverAccount ?? ""}"` };
    }
  }

  // 3) Recent enough (and not in the future).
  if (slip.paidAt) {
    const paid = new Date(slip.paidAt).getTime();
    if (Number.isFinite(paid)) {
      const ageMs = opts.now.getTime() - paid;
      if (ageMs > opts.maxAgeHours * 3_600_000) {
        return { ok: false, code: "TOO_OLD", detail: `paid ${slip.paidAt}` };
      }
      if (ageMs < -10 * 60_000) {
        return { ok: false, code: "NOT_A_SLIP", detail: `paid in the future ${slip.paidAt}` };
      }
    }
  }

  return { ok: true };
}
