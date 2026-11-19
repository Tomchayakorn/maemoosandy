import "server-only";
import { randomInt } from "node:crypto";
import { LUCKY_CARD_MESSAGES } from "../../data/lucky-card-messages";
import { BONUS_COINS, ODDS_TABLE, ODDS_TOTAL, type LuckyCardOutcomeKind } from "../lucky-card-config";

export type DrawnOutcome =
  | { kind: "message"; messageId: string }
  | { kind: "bonus"; coins: 100 | 300 | 500 }
  | { kind: "secret" };

/** Map a roll in [0, ODDS_TOTAL) to an outcome kind (pure, for tests). */
export function kindForRoll(roll: number): LuckyCardOutcomeKind {
  let acc = 0;
  for (const [kind, weight] of ODDS_TABLE) {
    acc += weight;
    if (roll < acc) return kind;
  }
  return "message";
}

/** Draw one outcome with crypto randomness. Server-side only. */
export function drawOutcome(rand: (maxExclusive: number) => number = (n) => randomInt(n)): DrawnOutcome {
  const kind = kindForRoll(rand(ODDS_TOTAL));
  if (kind === "secret") return { kind: "secret" };
  if (kind === "message") {
    const m = LUCKY_CARD_MESSAGES[rand(LUCKY_CARD_MESSAGES.length)];
    return { kind: "message", messageId: m.id };
  }
  return { kind: "bonus", coins: BONUS_COINS[kind] };
}
