import type { RpcErrorCode } from "@/types/database";

export type MatchCardFace = { position: number; symbol: number };

/** What the API returns for a round: only found pairs and the open card — the full layout only once the round is over. */
export type MatchRoundView = {
  roundId: string;
  status: "active" | "finished";
  turnsUsed: number;
  pairs: number;
  /** coins this round has paid so far */
  payout: number;
  /** number of cards turned so far in this round; the next flip must name it */
  step: number;
  matched: MatchCardFace[];
  open: MatchCardFace | null;
  layout: number[] | null;
  balance: number;
  roundsToday: number;
  /** only on a flip response */
  flip: null | {
    position: number;
    symbol: number;
    /** true when this card completed a turn */
    second: boolean;
    first: MatchCardFace | null;
    match: boolean;
    pairReward: number;
    bonus: number;
  };
};

export type MatchStateResponse = { round: MatchRoundView | null; balance: number; roundsToday: number };

type Raw = {
  round_id: string;
  status: "active" | "finished";
  turns_used: number;
  pairs: number;
  payout: number;
  step: number;
  matched: MatchCardFace[];
  open: MatchCardFace | null;
  layout: number[] | null;
  balance: number;
  rounds_today: number;
  flip?: {
    position: number;
    symbol: number;
    second: boolean;
    first_position?: number;
    first_symbol?: number;
    match?: boolean;
    pair_reward?: number;
    bonus?: number;
  } | null;
};

export function toMatchView(r: Raw): MatchRoundView {
  const f = r.flip;
  return {
    roundId: r.round_id,
    status: r.status,
    turnsUsed: r.turns_used,
    pairs: r.pairs,
    payout: r.payout,
    step: r.step,
    matched: r.matched ?? [],
    open: r.open ?? null,
    layout: r.status === "finished" ? (r.layout ?? null) : null,
    balance: r.balance,
    roundsToday: r.rounds_today,
    flip: f
      ? {
          position: f.position,
          symbol: f.symbol,
          second: f.second,
          first: f.first_position === undefined || f.first_symbol === undefined ? null : { position: f.first_position, symbol: f.first_symbol },
          match: f.match ?? false,
          pairReward: f.pair_reward ?? 0,
          bonus: f.bonus ?? 0,
        }
      : null,
  };
}

/** Errors that only mean "your screen is behind": the client re-reads the state quietly. */
export const STALE_CODES: readonly RpcErrorCode[] = ["STALE_ROUND_STATE", "CARD_ALREADY_OPEN", "CARD_ALREADY_MATCHED", "ROUND_NOT_ACTIVE", "ACTIVE_ROUND_EXISTS"];
