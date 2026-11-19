/** Client-safe shapes shared by the lucky-card API routes and UI (no odds here). */
export type LuckyCardOutcome =
  | { kind: "message"; messageId: string }
  | { kind: "bonus"; coins: 100 | 300 | 500 }
  | { kind: "secret"; prizeId: string; amountThb: number };

export type LuckyCardPlayResponse = {
  outcome: LuckyCardOutcome;
  /** Balance after the round (charge and any bonus already applied). */
  balance: number;
  cost: number;
};

export type LuckyCardWithdrawResponse = { requestId: string; amountThb: number };
