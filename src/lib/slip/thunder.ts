import "server-only";

import type { SlipProvider, SlipResult, VerifyInput } from "./types";

/**
 * Thunder Solution API v1 — POST https://api.thunder.in.th/v1/verify (multipart, field `file`, ≤4MB).
 * Docs: https://document.thunder.in.th/en/v1/verify/bank/image (checked 2026-11-18).
 * Success: { status: 200, data: { transRef, date, amount: { amount }, sender, receiver: { account: { name: { th, en }, bank?, proxy? } } } }
 * Error:   { status, message: "duplicate_slip" | "slip_not_found" | ... }
 * The receiver account number is not always returned, so our own name/account check (checks.ts) decides.
 */
const ENDPOINT = "https://api.thunder.in.th/v1/verify";

type Name = { th?: string; en?: string };
type ThunderOk = {
  status: number;
  data?: {
    transRef?: string;
    date?: string;
    amount?: { amount?: number } | number;
    receiver?: {
      account?: {
        name?: Name;
        bank?: { type?: string; account?: string };
        proxy?: { type?: string; account?: string };
      };
    };
  };
  message?: string;
};

/** Pure mapping so it can be unit-tested without the network. */
export function mapThunderResponse(httpStatus: number, json: ThunderOk | null): SlipResult {
  if (!json) return { ok: false, code: "PROVIDER_ERROR", detail: `HTTP ${httpStatus} (no JSON)` };
  const status = json.status ?? httpStatus;
  if (status !== 200 || !json.data) {
    const msg = json.message ?? `HTTP_${status}`;
    switch (msg) {
      case "duplicate_slip":
        return { ok: false, code: "DUPLICATE", detail: "thunder duplicate_slip" };
      case "slip_not_found":
      case "qrcode_not_found":
        return { ok: false, code: "NOT_A_SLIP", detail: msg };
      case "slip_pending":
        return { ok: false, code: "SLIP_PENDING", detail: msg };
      case "invalid_image":
      case "image_size_too_large":
      case "invalid_payload":
        return { ok: false, code: "BAD_IMAGE", detail: msg };
      default:
        return { ok: false, code: "PROVIDER_ERROR", detail: msg };
    }
  }
  const d = json.data;
  if (!d.transRef) return { ok: false, code: "NOT_A_SLIP", detail: "no transRef" };
  const amount = typeof d.amount === "number" ? d.amount : Number(d.amount?.amount);
  if (!Number.isFinite(amount)) return { ok: false, code: "PROVIDER_ERROR", detail: "no amount" };
  const acct = d.receiver?.account;
  return {
    ok: true,
    slip: {
      provider: "thunder",
      transRef: d.transRef,
      amount,
      paidAt: d.date ?? null,
      receiverName: acct?.name?.th ?? acct?.name?.en ?? null,
      receiverAccount: acct?.bank?.account ?? acct?.proxy?.account ?? null,
      receiverMatched: null, // decided by our own checks
      providerRef: d.transRef,
    },
  };
}

export function thunderProvider(apiKey: string): SlipProvider {
  return {
    name: "thunder",
    async verify({ file, fileName }: VerifyInput): Promise<SlipResult> {
      const form = new FormData();
      form.append("file", file, fileName);
      // Thunder's duplicate flag is optional here: our own UNIQUE slip_ref is the authority.
      if (process.env.THUNDER_CHECK_DUPLICATE !== "false") form.append("checkDuplicate", "true");
      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(20_000),
        });
        const json = (await res.json().catch(() => null)) as ThunderOk | null;
        return mapThunderResponse(res.status, json);
      } catch (err) {
        return { ok: false, code: "PROVIDER_ERROR", detail: `network: ${(err as Error).message}` };
      }
    },
  };
}
