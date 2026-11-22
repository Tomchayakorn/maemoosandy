import type { RoundStatus } from "./config";

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
  };
}
