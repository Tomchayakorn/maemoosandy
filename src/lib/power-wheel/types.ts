import type { RoundStatus } from "./config";

/** What the API returns for a round (and for one spin of it). */
export type PowerRoundView = {
  roundId: string;
  status: RoundStatus;
  bet: number;
  /** levels cleared so far */
  level: number;
  /** while active: what stopping now would pay; when finished: what was paid */
  payout: number;
  balance: number;
  /** set when the round paid out by itself: the top level was cleared, or the payout cap was reached */
  auto: "top" | "cap" | null;
  /** only on a spin response: the slice the wheel landed on and whether it was a danger slice */
  slice: number | null;
  failed: boolean;
};

type Raw = {
  round_id: string;
  status: RoundStatus;
  bet: number;
  level: number;
  payout: number;
  balance: number;
  auto?: "top" | "cap" | null;
  slice?: number | null;
  failed?: boolean;
};

export function toRoundView(r: Raw): PowerRoundView {
  return {
    roundId: r.round_id,
    status: r.status,
    bet: r.bet,
    level: r.level,
    payout: r.payout,
    balance: r.balance,
    auto: r.auto ?? null,
    slice: r.slice ?? null,
    failed: r.failed ?? false,
  };
}
