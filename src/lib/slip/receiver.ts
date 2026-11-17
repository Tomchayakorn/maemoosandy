import "server-only";

import type { ReceiverConfig } from "./checks";

const THAI = /[฀-๿]/;

/**
 * Our receiving account: SHOP_BANK_ACCOUNT_* (falls back to PROMPTPAY_RECEIVER_*).
 * The expected name is the Thai or English one depending on the script the slip prints.
 */
export function shopReceiver(slipName: string | null): ReceiverConfig {
  const th = process.env.SHOP_BANK_ACCOUNT_NAME?.trim() || process.env.PROMPTPAY_RECEIVER_NAME?.trim() || null;
  const en = process.env.SHOP_BANK_ACCOUNT_NAME_EN?.trim() || null;
  const name = slipName && !THAI.test(slipName) && en ? en : th;
  const account =
    process.env.SHOP_BANK_ACCOUNT_NO?.trim() || process.env.PROMPTPAY_RECEIVER_ACCOUNT?.trim() || process.env.PROMPTPAY_ID?.trim() || null;
  return { name, account };
}
