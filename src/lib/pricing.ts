/**
 * Reading prices in coins. Server routes charge from these constants —
 * never from a value sent by the client.
 */
export const FORTUNE_PRICES = {
  tarot: 99,
  birthdate: 199,
} as const;

/** Coins per lucky-wheel spin once the free spin tickets are used up. Server-side only. */
export const WHEEL_SPIN_COST = 50; // was 99 until 2026-11-20 (a 50-coin prize = break-even, 25 = half back)

export type FortuneKind = keyof typeof FORTUNE_PRICES;

export function formatCoins(n: number): string {
  return n.toLocaleString("th-TH");
}
