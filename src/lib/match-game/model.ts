/** Reference model of migration 0022's match_start / match_flip (pure, used by tests; the database is the real thing). */
import { CARDS, CLEAR_BONUS, COST, DAILY_ROUNDS, MAX_TURNS, PAIR_REWARD, PAIRS } from "./config";

export type ModelRound = { id: number; day: string; layout: number[]; matched: Set<number>; first: number | null; turns: number; pairs: number; payout: number; status: "active" | "finished" };
export type ModelState = { balance: number; rounds: ModelRound[]; ledger: { reason: "match_bet" | "match_win" | "match_bonus"; delta: number; roundId: number }[] };

export const newState = (balance: number): ModelState => ({ balance, rounds: [], ledger: [] });
export const stepOf = (r: ModelRound) => r.turns * 2 + (r.first === null ? 0 : 1);

export function start(s: ModelState, layout: number[], day: string): ModelRound {
  const counts = layout.reduce<Record<number, number>>((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {});
  if (layout.length !== CARDS || Object.keys(counts).length !== PAIRS || Object.entries(counts).some(([k, n]) => n !== 2 || +k < 0 || +k >= PAIRS)) throw new Error("INVALID_LAYOUT");
  if (s.rounds.some((r) => r.status === "active")) throw new Error("ACTIVE_ROUND_EXISTS");
  if (s.rounds.filter((r) => r.day === day).length >= DAILY_ROUNDS) throw new Error("DAILY_LIMIT_REACHED");
  if (s.balance < COST) throw new Error("INSUFFICIENT_COINS");
  const round: ModelRound = { id: s.rounds.length + 1, day, layout: [...layout], matched: new Set(), first: null, turns: 0, pairs: 0, payout: 0, status: "active" };
  s.rounds.push(round);
  s.balance -= COST;
  s.ledger.push({ reason: "match_bet", delta: -COST, roundId: round.id });
  return round;
}

export function flip(s: ModelState, r: ModelRound, position: number, step: number): { match: boolean | null; pairReward: number; bonus: number } {
  if (r.status !== "active") throw new Error("ROUND_NOT_ACTIVE");
  if (!Number.isInteger(position) || position < 0 || position >= CARDS) throw new Error("INVALID_CARD");
  if (step !== stepOf(r)) throw new Error("STALE_ROUND_STATE");
  if (r.matched.has(position)) throw new Error("CARD_ALREADY_MATCHED");
  if (r.first === position) throw new Error("CARD_ALREADY_OPEN");
  if (r.first === null) {
    r.first = position;
    return { match: null, pairReward: 0, bonus: 0 };
  }
  const match = r.layout[r.first] === r.layout[position];
  let pairReward = 0;
  let bonus = 0;
  r.turns += 1;
  if (match) {
    r.matched.add(r.first).add(position);
    r.pairs += 1;
    pairReward = PAIR_REWARD;
    if (r.pairs === PAIRS) bonus = CLEAR_BONUS;
    s.balance += pairReward + bonus;
    r.payout += pairReward + bonus;
    s.ledger.push({ reason: "match_win", delta: pairReward, roundId: r.id });
    if (bonus) s.ledger.push({ reason: "match_bonus", delta: bonus, roundId: r.id });
  }
  r.first = null;
  if (r.pairs === PAIRS || r.turns >= MAX_TURNS) r.status = "finished";
  return { match, pairReward, bonus };
}
