import "server-only";
import { randomInt } from "node:crypto";
import { LUCKY_CARD_MESSAGES } from "../../data/lucky-card-messages";
import { BONUS_COINS, ODDS_TABLE, ODDS_TOTAL, type LuckyCardOutcomeKind } from "../lucky-card-config";

export type DrawnOutcome =
  | { kind: "message"; messageId: string }
  | { kind: "bonus"; coins: number }
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

export type GuaranteeState = { dryRounds: number; cycleRounds: number };
export type GuaranteeParams = { dryAfter: number; dryCoins: number; everyRounds: number; everyCoins: number };

/**
 * Reference model of the two-step guarantee that the SQL function `play_lucky_card` (migration 0015) applies under the wallet lock.
 * The database is the source of truth; this keeps the rule unit-testable and lets tests simulate the long-run payout.
 * Only a plain message is ever upgraded: step 2 (every `everyRounds`-th round, continuous count) beats step 1
 * (`dryAfter` rounds in a row without any bonus/secret). A bonus/secret (natural or guaranteed) resets the dry streak;
 * the continuous count only resets when it reaches `everyRounds`.
 */
export function resolveGuarantee(
  drawn: DrawnOutcome,
  state: GuaranteeState,
  g: GuaranteeParams,
): { outcome: DrawnOutcome; guaranteed: false | "dry" | "every"; state: GuaranteeState } {
  const cycle = state.cycleRounds + 1;
  const everyDue = g.everyRounds > 0 && cycle >= g.everyRounds;
  const nextCycle = everyDue ? 0 : cycle;
  if (drawn.kind === "message") {
    if (everyDue) return { outcome: { kind: "bonus", coins: g.everyCoins as 100 }, guaranteed: "every", state: { dryRounds: 0, cycleRounds: nextCycle } };
    if (g.dryAfter > 0 && state.dryRounds + 1 >= g.dryAfter) {
      return { outcome: { kind: "bonus", coins: g.dryCoins as 100 }, guaranteed: "dry", state: { dryRounds: 0, cycleRounds: nextCycle } };
    }
    return { outcome: drawn, guaranteed: false, state: { dryRounds: state.dryRounds + 1, cycleRounds: nextCycle } };
  }
  return { outcome: drawn, guaranteed: false, state: { dryRounds: 0, cycleRounds: nextCycle } };
}
