import type { LuckyCardOutcome } from "./types";

/**
 * Which result sound ดวงดี มีเฮ plays (pure, client-safe; display only — the outcome itself is decided by the server).
 *   soft   — a fortune message (no coins): a short gentle two-note chime
 *   coins  — a bonus below 300 (incl. the guaranteed bonuses): three clear notes
 *   good   — a 300 bonus: coins and chimes
 *   big    — a 500 bonus: rising celebration chord
 *   secret — เทพประทานทรัพย์: the grandest fanfare
 */
export type CardSoundTier = "soft" | "coins" | "good" | "big" | "secret";

export function cardSoundTier(outcome: LuckyCardOutcome): CardSoundTier {
  if (outcome.kind === "message") return "soft";
  if (outcome.kind === "secret") return "secret";
  if (outcome.coins >= 500) return "big";
  if (outcome.coins >= 300) return "good";
  return "coins";
}
