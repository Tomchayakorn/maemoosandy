import "server-only";

import { createHash } from "node:crypto";
import { easySlipProvider } from "./easyslip";
import { slipOkProvider } from "./slipok";
import { thunderProvider } from "./thunder";
import type { SlipProvider, SlipResult, VerifyInput } from "./types";

export * from "./types";

/**
 * Development-only provider: accepts any image as a correct payment. The transRef
 * is a hash of the file, so uploading the same image twice exercises duplicate
 * protection. Refused outright in production.
 */
const mockProvider: SlipProvider = {
  name: "mock",
  async verify({ file, expectedAmount }: VerifyInput): Promise<SlipResult> {
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      ok: true,
      slip: {
        provider: "mock",
        transRef: `MOCK-${createHash("sha256").update(bytes).digest("hex").slice(0, 20)}`,
        amount: expectedAmount,
        paidAt: new Date().toISOString(),
        receiverName: null,
        receiverAccount: null,
        receiverMatched: true,
        providerRef: null,
      },
    };
  },
};

/** The configured slip provider, or null when not set up. */
export function getSlipProvider(): SlipProvider | null {
  const provider = (process.env.SLIP_PROVIDER || "easyslip").toLowerCase();
  const apiKey = process.env.SLIP_API_KEY?.trim();

  if (provider === "mock") {
    return process.env.NODE_ENV === "production" ? null : mockProvider;
  }
  if (provider === "thunder") {
    const key = process.env.THUNDER_API_KEY?.trim();
    return key ? thunderProvider(key) : null;
  }
  if (!apiKey) return null;
  if (provider === "slipok") {
    const branch = process.env.SLIPOK_BRANCH_ID?.trim();
    return branch ? slipOkProvider(apiKey, branch) : null;
  }
  return easySlipProvider(apiKey);
}
