import "server-only";

import type { SlipProvider, SlipResult, VerifyInput } from "./types";

/**
 * EasySlip API v2 — POST https://api.easyslip.com/v2/verify/bank (multipart).
 * Docs: https://document.easyslip.com/en/v2/verify/bank/image (checked 2026-11-18).
 * Fields: image (≤4MB), matchAmount, matchAccount (receiver vs accounts registered
 * in the EasySlip dashboard), checkDuplicate.
 */
const ENDPOINT = "https://api.easyslip.com/v2/verify/bank";

type EasySlipName = { th?: string; en?: string };
type EasySlipParty = {
  account?: {
    name?: EasySlipName;
    bank?: { type?: string; account?: string };
    proxy?: { type?: string; account?: string };
  };
};
type EasySlipSuccess = {
  success: true;
  data: {
    isDuplicate?: boolean;
    matchedAccount?: unknown;
    isAmountMatched?: boolean;
    rawSlip: {
      transRef: string;
      date?: string;
      amount: { amount: number };
      receiver?: EasySlipParty;
    };
  };
};
type EasySlipError = { success: false; error?: { code?: string; message?: string } };

export function easySlipProvider(apiKey: string): SlipProvider {
  return {
    name: "easyslip",
    async verify({ file, fileName, expectedAmount }: VerifyInput): Promise<SlipResult> {
      const form = new FormData();
      form.append("image", file, fileName);
      form.append("matchAmount", String(expectedAmount));
      form.append("matchAccount", "true");
      form.append("checkDuplicate", "true");

      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        return { ok: false, code: "PROVIDER_ERROR", detail: `network: ${(err as Error).message}` };
      }

      const json = (await res.json().catch(() => null)) as EasySlipSuccess | EasySlipError | null;
      if (!json) return { ok: false, code: "PROVIDER_ERROR", detail: `HTTP ${res.status} (no JSON)` };

      if (!json.success) {
        const code = json.error?.code ?? `HTTP_${res.status}`;
        const detail = `${code}: ${json.error?.message ?? ""}`;
        switch (code) {
          case "SLIP_NOT_FOUND":
            return { ok: false, code: "NOT_A_SLIP", detail };
          case "SLIP_PENDING":
            return { ok: false, code: "SLIP_PENDING", detail };
          case "IMAGE_SIZE_TOO_LARGE":
          case "INVALID_IMAGE_FORMAT":
          case "INVALID_IMAGE_TYPE":
          case "VALIDATION_ERROR":
            return { ok: false, code: "BAD_IMAGE", detail };
          default:
            return { ok: false, code: "PROVIDER_ERROR", detail };
        }
      }

      const d = json.data;
      if (d.isDuplicate) return { ok: false, code: "DUPLICATE", detail: "easyslip isDuplicate" };
      const raw = d.rawSlip;
      const acct = raw.receiver?.account;
      return {
        ok: true,
        slip: {
          provider: "easyslip",
          transRef: raw.transRef,
          amount: Number(raw.amount?.amount),
          paidAt: raw.date ?? null,
          receiverName: acct?.name?.th ?? acct?.name?.en ?? null,
          receiverAccount: acct?.bank?.account ?? acct?.proxy?.account ?? null,
          // A returned matchedAccount confirms the receiver. Its absence is ambiguous (e.g. no
          // accounts registered in the EasySlip dashboard), so fall back to our own name/account check.
          receiverMatched: d.matchedAccount ? true : null,
          providerRef: raw.transRef,
        },
      };
    },
  };
}
