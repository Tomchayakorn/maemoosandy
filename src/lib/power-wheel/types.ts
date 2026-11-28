import type { Bonus, RoundStatus, RulesVersion } from "./config";

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
  /** 1 = the original rules; 2 / 3 = a bonus round (migrations 0023 / 0024) */
  version: RulesVersion;
  /** the round's multiplier once unlocked (1 = unlocked, no bonus); null while still locked or in a version 1 round */
  bonus: Bonus | null;
  /** only on a spin response: this very spin unlocked the bonus */
  unlocked: boolean;
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
  /** absent before migration 0023 */
  bonus_version?: number | null;
  bonus?: number | null;
  unlocked?: boolean | null;
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
    version: r.bonus_version === 2 || r.bonus_version === 3 ? r.bonus_version : 1,
    bonus: r.bonus === 1 || r.bonus === 2 || r.bonus === 5 || r.bonus === 8 ? r.bonus : null,
    unlocked: r.unlocked ?? false,
  };
}
