import type { Bonus, RoundStatus, RulesVersion } from "./config";

/** What the API returns for a round. `mineMask` is null while the round is active (the cursed chests stay secret). */
export type MysticRoundView = {
  roundId: string;
  status: RoundStatus;
  bet: number;
  mines: number;
  openedMask: number;
  safeCount: number;
  /** while active: what a cash out would pay now; when finished: what was paid */
  payout: number;
  mineMask: number | null;
  balance: number;
  /** set when the round paid out by itself: all safe chests opened, or the payout cap reached */
  auto: "all_open" | "cap" | null;
  /** 2 = a bonus round (migration 0025); 1 = the original rules */
  version: RulesVersion;
  /** the round's multiplier once unlocked (1 = unlocked, no bonus); null while still locked or in a version 1 round */
  bonus: Bonus | null;
  /** only on an open response: this very chest unlocked the bonus */
  unlocked: boolean;
};

type Raw = {
  round_id: string;
  status: RoundStatus;
  bet: number;
  mines: number;
  opened_mask: number;
  safe_count: number;
  payout: number;
  mine_mask: number | null;
  balance: number;
  auto?: "all_open" | "cap" | null;
  /** absent before migration 0025 */
  bonus_version?: number | null;
  bonus?: number | null;
  unlocked?: boolean | null;
};

export function toRoundView(r: Raw): MysticRoundView {
  return {
    roundId: r.round_id,
    status: r.status,
    bet: r.bet,
    mines: r.mines,
    openedMask: r.opened_mask,
    safeCount: r.safe_count,
    payout: r.payout,
    // belt and braces: the SQL already returns null for an active round; never pass a mask through for one
    mineMask: r.status === "active" ? null : r.mine_mask,
    balance: r.balance,
    auto: r.auto ?? null,
    version: r.bonus_version === 2 ? 2 : 1,
    bonus: r.bonus === 1 || r.bonus === 2 || r.bonus === 5 || r.bonus === 8 ? r.bonus : null,
    unlocked: r.unlocked ?? false,
  };
}
