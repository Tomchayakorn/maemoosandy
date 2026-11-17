import "server-only";

import { existsSync } from "node:fs";
import { join } from "node:path";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

/**
 * PromptPay QR for top-ups.
 *  - PROMPTPAY_ID set (phone, national ID or e-wallet ID): a dynamic QR per package
 *    with the exact amount embedded, so customers can't mistype it.
 *  - otherwise the owner's own static QR image from public/ is shown
 *    (the customer then types the amount in their bank app).
 */

/** Files checked in order; the first that exists is used. */
const STATIC_QR_CANDIDATES = ["/promptpay-qr.jpg", "/promptpay-qr.png", "/images/promptpay-qr.png"] as const;
// Checked once at module load (the file only changes on deploy).
const staticQrSrc = STATIC_QR_CANDIDATES.find((p) => existsSync(join(process.cwd(), "public", p))) ?? null;

export type PromptPayQr =
  | { kind: "dynamic"; svg: string; amount: number }
  | { kind: "static"; src: string; amount: number }
  | { kind: "none"; amount: number };

export function promptPayReceiverName(): string | null {
  return process.env.PROMPTPAY_RECEIVER_NAME?.trim() || null;
}

/** EMVCo payload for a PromptPay transfer of `amount` baht. */
export function promptPayPayload(id: string, amount: number): string {
  return generatePayload(id.replace(/[^0-9]/g, ""), { amount });
}

export async function promptPayQr(amount: number): Promise<PromptPayQr> {
  const id = process.env.PROMPTPAY_ID?.trim();
  if (id) {
    const svg = await QRCode.toString(promptPayPayload(id, amount), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#0b0a12", light: "#ffffff" },
    });
    return { kind: "dynamic", svg, amount };
  }
  if (staticQrSrc) return { kind: "static", src: staticQrSrc, amount };
  return { kind: "none", amount };
}
