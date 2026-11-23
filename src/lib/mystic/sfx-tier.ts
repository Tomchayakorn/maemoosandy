/** Sound tier of a reward in เปิดหีบมนตรา (pure, client-safe): the bigger the prize relative to the bet, the grander the effect. */
export type RewardTier = "small" | "good" | "big" | "jackpot";

/**
 * @param payout coins the round would pay (or paid)
 * @param bet    the bet of the round
 * @param auto   set when the round paid out by itself (all safe chests opened, or the payout cap reached) → the grandest effect
 */
export function rewardTier(payout: number, bet: number, auto: "all_open" | "cap" | null | undefined): RewardTier {
  if (auto) return "jackpot";
  if (bet <= 0) return "small";
  const ratio = payout / bet;
  if (payout >= 1000 || ratio >= 10) return "big";
  if (ratio >= 2) return "good";
  return "small";
}
