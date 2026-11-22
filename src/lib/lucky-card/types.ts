/** Client-safe shapes shared by the lucky-card API routes and UI (no odds here). */
export type LuckyCardOutcome =
  | { kind: "message"; messageId: string }
  | { kind: "bonus"; coins: number; /** set when the bonus came from a guarantee: "dry" = no bonus for N rounds, "every" = every Nth round */ guaranteed?: false | "dry" | "every" }
  | { kind: "secret"; prizeId: string; amountThb: number };

export type LuckyCardPlayResponse = {
  outcome: LuckyCardOutcome;
  /** Balance after the round (charge and any bonus already applied). */
  balance: number;
  /** Accumulated bonus coins from this game (progress towards the 1,000 cash-out). Null if migration 0007 isn't installed. */
  bonusTotal: number | null;
  cost: number;
  /** Guarantee counters after this round (for the countdown). Null if migration 0015 isn't installed. */
  guarantee: { dryRounds: number; cycleRounds: number } | null;
};

export type LuckyCardWithdrawResponse = { requestId: string; amountThb: number };

export type LuckyCardBonusWithdrawResponse = { requestId: string; amountThb: number; alreadyPending: boolean; bonusTotal: number };
