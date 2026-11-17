import "server-only";

import type { SlipProvider, SlipResult, VerifyInput } from "./types";

/**
 * SlipOK v1.8 — POST https://api.slipok.com/api/line/apikey/{branchId} (multipart).
 * Docs: https://slipok.com/api-documentation/check-slip/ (checked 2026-11-18).
 * Fields: files, log=true (checks the receiver against the branch's bank account and
 * remembers the slip for duplicate detection), amount (expected amount).
 * Errors 1012 duplicate, 1013 amount mismatch, 1014 wrong receiver.
 */

type SlipOkParty = {
  displayName?: string;
  name?: string;
  proxy?: { type?: string; value?: string };
  account?: { type?: string; value?: string };
};
type SlipOkData = {
  success?: boolean;
  transRef: string;
  transTimestamp?: string;
  amount: number;
  receiver?: SlipOkParty;
};
type SlipOkResponse = { success?: boolean; code?: number; message?: string; data?: SlipOkData };

export function slipOkProvider(apiKey: string, branchId: string): SlipProvider {
  const endpoint = `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branchId)}`;
  return {
    name: "slipok",
    async verify({ file, fileName, expectedAmount }: VerifyInput): Promise<SlipResult> {
      const form = new FormData();
      form.append("files", file, fileName);
      form.append("log", "true");
      form.append("amount", String(expectedAmount));

      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "x-authorization": apiKey },
          body: form,
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        return { ok: false, code: "PROVIDER_ERROR", detail: `network: ${(err as Error).message}` };
      }

      const json = (await res.json().catch(() => null)) as SlipOkResponse | null;
      if (!json) return { ok: false, code: "PROVIDER_ERROR", detail: `HTTP ${res.status} (no JSON)` };

      if (!json.success || !json.data) {
        const detail = `${json.code ?? res.status}: ${json.message ?? ""}`;
        switch (json.code) {
          case 1005:
          case 1006:
            return { ok: false, code: "BAD_IMAGE", detail };
          case 1007:
          case 1008:
          case 1011:
            return { ok: false, code: "NOT_A_SLIP", detail };
          case 1009:
          case 1010:
            return { ok: false, code: "SLIP_PENDING", detail };
          case 1012:
            return { ok: false, code: "DUPLICATE", detail };
          case 1013:
            return { ok: false, code: "AMOUNT_MISMATCH", detail };
          case 1014:
            return { ok: false, code: "RECEIVER_MISMATCH", detail };
          default:
            return { ok: false, code: "PROVIDER_ERROR", detail };
        }
      }

      const d = json.data;
      return {
        ok: true,
        slip: {
          provider: "slipok",
          transRef: d.transRef,
          amount: Number(d.amount),
          paidAt: d.transTimestamp ?? null,
          receiverName: d.receiver?.displayName ?? d.receiver?.name ?? null,
          receiverAccount: d.receiver?.account?.value ?? d.receiver?.proxy?.value ?? null,
          // log=true makes SlipOK reject wrong receivers itself (code 1014), so a success means it matched.
          receiverMatched: true,
          providerRef: d.transRef,
        },
      };
    },
  };
}
