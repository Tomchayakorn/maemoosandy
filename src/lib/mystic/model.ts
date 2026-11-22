import { BETS, MAX_PAYOUT, maxSafe, payoutFor, popcount, reachesCap, TILES, type RoundStatus } from "./config";

/**
 * Reference model of the three RPCs of migration 0020 (mystic_start / mystic_open / mystic_cashout). Pure, so the rules are unit-tested:
 * one active round per user, bet charged at start, a mine ends the round with no payout, cash out needs ≥ 1 safe chest and pays once,
 * the cap and "all safe chests opened" pay out automatically. The database is the source of truth.
 */
export type Round = {
  id: number;
  user: string;
  bet: number;
  mines: number;
  mineMask: number;
  openedMask: number;
  safeCount: number;
  status: RoundStatus;
  payout: number;
};
export type ModelState = { balances: Record<string, number>; rounds: Round[]; ledger: { user: string; reason: "mystic_bet" | "mystic_win"; coins: number; round: number }[] };
export type ModelError =
  | "INVALID_BET" | "INVALID_MINES" | "INVALID_TILE" | "INSUFFICIENT_COINS" | "ACTIVE_ROUND_EXISTS"
  | "ROUND_NOT_FOUND" | "ROUND_NOT_ACTIVE" | "TILE_ALREADY_OPENED" | "NO_SAFE_TILE";
export type ModelResult = { ok: true; state: ModelState; round: Round; auto?: "all_open" | "cap" } | { ok: false; error: ModelError };

const upd = (s: ModelState, r: Round): ModelState => ({ ...s, rounds: s.rounds.map((x) => (x.id === r.id ? r : x)) });
const find = (s: ModelState, user: string, id: number) => s.rounds.find((r) => r.id === id && r.user === user);

export function start(s: ModelState, user: string, bet: number, mines: number, mineMask: number): ModelResult {
  if (!(BETS as readonly number[]).includes(bet)) return { ok: false, error: "INVALID_BET" };
  if (![1, 2, 3].includes(mines) || mineMask < 0 || mineMask > 511 || popcount(mineMask) !== mines) return { ok: false, error: "INVALID_MINES" };
  if (s.rounds.some((r) => r.user === user && r.status === "active")) return { ok: false, error: "ACTIVE_ROUND_EXISTS" };
  if ((s.balances[user] ?? 0) < bet) return { ok: false, error: "INSUFFICIENT_COINS" };
  const round: Round = { id: s.rounds.length + 1, user, bet, mines, mineMask, openedMask: 0, safeCount: 0, status: "active", payout: 0 };
  return {
    ok: true,
    round,
    state: {
      balances: { ...s.balances, [user]: s.balances[user] - bet },
      rounds: [...s.rounds, round],
      ledger: [...s.ledger, { user, reason: "mystic_bet", coins: -bet, round: round.id }],
    },
  };
}

function pay(s: ModelState, r: Round, status: "cashed" | "cleared", payout: number): ModelResult {
  const done: Round = { ...r, status, payout };
  return {
    ok: true,
    round: done,
    state: {
      balances: { ...s.balances, [r.user]: s.balances[r.user] + payout },
      rounds: s.rounds.map((x) => (x.id === r.id ? done : x)),
      ledger: [...s.ledger, { user: r.user, reason: "mystic_win", coins: payout, round: r.id }],
    },
  };
}

export function open(s: ModelState, user: string, id: number, tile: number): ModelResult {
  if (!Number.isInteger(tile) || tile < 0 || tile >= TILES) return { ok: false, error: "INVALID_TILE" };
  const r = find(s, user, id);
  if (!r) return { ok: false, error: "ROUND_NOT_FOUND" };
  if (r.status !== "active") return { ok: false, error: "ROUND_NOT_ACTIVE" };
  if ((r.openedMask >> tile) & 1) return { ok: false, error: "TILE_ALREADY_OPENED" };
  const openedMask = r.openedMask | (1 << tile);
  if ((r.mineMask >> tile) & 1) {
    const lost: Round = { ...r, openedMask, status: "lost", payout: 0 };
    return { ok: true, round: lost, state: upd(s, lost) };
  }
  const k = r.safeCount + 1;
  const next: Round = { ...r, openedMask, safeCount: k };
  if (k === maxSafe(r.mines)) return { ...pay(s, next, "cleared", payoutFor(r.bet, r.mines, k)), auto: "all_open" } as ModelResult;
  if (reachesCap(r.bet, r.mines, k)) return { ...pay(s, next, "cleared", MAX_PAYOUT), auto: "cap" } as ModelResult;
  const live: Round = { ...next, payout: payoutFor(r.bet, r.mines, k) }; // what a cash out would pay now
  return { ok: true, round: live, state: upd(s, live) };
}

export function cashout(s: ModelState, user: string, id: number): ModelResult {
  const r = find(s, user, id);
  if (!r) return { ok: false, error: "ROUND_NOT_FOUND" };
  if (r.status !== "active") return { ok: false, error: "ROUND_NOT_ACTIVE" };
  if (r.safeCount < 1) return { ok: false, error: "NO_SAFE_TILE" };
  return pay(s, r, "cashed", payoutFor(r.bet, r.mines, r.safeCount));
}

export const emptyState = (balances: Record<string, number>): ModelState => ({ balances, rounds: [], ledger: [] });
