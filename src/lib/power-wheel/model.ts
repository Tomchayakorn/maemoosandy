import {
  BETS, BONUS_UNLOCK_LEVEL, LATEST_BONUS_VERSION, MAX_LEVEL, SLICES, bonusForRoll, isDangerSlice, payoutFor, reachesCap, roundPayout, roundReachesCap, type Bonus, type BonusVersion,
  type RoundStatus,
} from "./config";

/**
 * Reference model of the SQL functions (migrations 0021, 0023 and 0024). The database is the source of truth; this keeps the rules unit-testable
 * (double stop, stop with nothing cleared, finished rounds, conservation of coins). Not used at runtime.
 */
export type ModelRound = { id: number; bet: number; level: number; status: RoundStatus; payout: number; version?: BonusVersion; bonus?: Bonus };
export type ModelState = { balance: number; rounds: ModelRound[]; ledger: { reason: "power_bet" | "power_win"; delta: number; roundId: number }[] };

export class ModelError extends Error {}

export function newState(balance: number): ModelState {
  return { balance, rounds: [], ledger: [] };
}

function find(s: ModelState, id: number): ModelRound {
  const r = s.rounds.find((x) => x.id === id);
  if (!r) throw new ModelError("ROUND_NOT_FOUND");
  return r;
}

export function start(s: ModelState, bet: number): ModelRound {
  if (!(BETS as readonly number[]).includes(bet)) throw new ModelError("INVALID_BET");
  if (s.rounds.some((r) => r.status === "active")) throw new ModelError("ACTIVE_ROUND_EXISTS");
  if (s.balance < bet) throw new ModelError("INSUFFICIENT_COINS");
  const r: ModelRound = { id: s.rounds.length + 1, bet, level: 0, status: "active", payout: 0 };
  s.rounds.push(r);
  s.balance -= bet;
  s.ledger.push({ reason: "power_bet", delta: -bet, roundId: r.id });
  return r;
}

function pay(s: ModelState, r: ModelRound, amount: number) {
  s.balance += amount;
  s.ledger.push({ reason: "power_win", delta: amount, roundId: r.id });
}

export function spin(s: ModelState, id: number, slice: number): { round: ModelRound; failed: boolean; auto: "top" | "cap" | null } {
  if (!Number.isInteger(slice) || slice < 0 || slice >= SLICES) throw new ModelError("INVALID_SLICE");
  const r = find(s, id);
  if (r.status !== "active") throw new ModelError("ROUND_NOT_ACTIVE");
  const k = r.level + 1;
  if (isDangerSlice(k, slice)) {
    r.status = "lost";
    r.payout = 0;
    return { round: r, failed: true, auto: null };
  }
  r.level = k;
  r.payout = payoutFor(r.bet, k);
  const auto = k === MAX_LEVEL ? "top" : reachesCap(r.bet, k) ? "cap" : null;
  if (auto) {
    r.status = "cleared";
    pay(s, r, r.payout);
  }
  return { round: r, failed: false, auto };
}

export function stop(s: ModelState, id: number): ModelRound {
  const r = find(s, id);
  if (r.status !== "active") throw new ModelError("ROUND_NOT_ACTIVE");
  if (r.level < 1) throw new ModelError("NO_LEVEL_CLEARED");
  r.status = "cashed";
  pay(s, r, r.payout);
  return r;
}

export function startBonus(s: ModelState, bet: number, version: BonusVersion = LATEST_BONUS_VERSION): ModelRound {
  const r = start(s, bet);
  r.version = version;
  return r;
}

/** power_spin_bonus: an old-rule round behaves exactly as before; a bonus round unlocks its multiplier once, on clearing the unlock level. */
export function spinBonus(s: ModelState, id: number, slice: number, roll: number): { round: ModelRound; failed: boolean; auto: "top" | "cap" | null; unlocked: boolean } {
  if (!Number.isInteger(slice) || slice < 0 || slice >= SLICES) throw new ModelError("INVALID_SLICE");
  if (bonusForRoll(roll) === null) throw new ModelError("INVALID_REWARD");
  const r = find(s, id);
  if (r.status !== "active") throw new ModelError("ROUND_NOT_ACTIVE");
  const version = r.version;
  if (!version) return { ...spin(s, id, slice), unlocked: false };
  const k = r.level + 1;
  if (isDangerSlice(k, slice)) {
    r.status = "lost";
    r.payout = 0;
    return { round: r, failed: true, auto: null, unlocked: false };
  }
  const unlocked = r.bonus === undefined && k >= BONUS_UNLOCK_LEVEL;
  if (unlocked) r.bonus = bonusForRoll(roll, version)!; // the odds of the round's own version
  r.level = k;
  r.payout = roundPayout(r.bet, k, version, r.bonus ?? null);
  const auto = k === MAX_LEVEL ? "top" : roundReachesCap(r.bet, k, version, r.bonus ?? null) ? "cap" : null;
  if (auto) {
    r.status = "cleared";
    pay(s, r, r.payout);
  }
  return { round: r, failed: false, auto, unlocked };
}
