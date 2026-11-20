/**
 * "การ์ด +ความเฮง" (luck card): a wheel prize the player keeps and uses when they want.
 * Using one starts a buff: for the next BUFF_ROUNDS spins the chance of the 500-coin prize is multiplied by BUFF_MULTIPLIER.
 * Client-safe constants + a pure reference model of the rules implemented by the SQL functions `use_luck_card` and
 * `spin_wheel_cycle` (migration 0010). The database is the source of truth (wallet row lock); this keeps the rules testable.
 */
export const BUFF_ROUNDS = 3;
export const BUFF_MULTIPLIER = 1.3;

export type LuckState = { cards: number; buffRounds: number };

export type Wallet = { balance: number; tickets: number };

export type UseResult =
  | { ok: true; state: LuckState }
  | { ok: false; code: "NO_LUCK_CARDS" | "BUFF_ALREADY_ACTIVE" | "INSUFFICIENT_COINS" };

/** Can this wallet spin right now? A free ticket, or enough coins for a paid spin. */
export function canSpinNow(w: Wallet, cost: number): boolean {
  return w.tickets >= 1 || w.balance >= cost;
}

/**
 * Press "ใช้การ์ด": needs a card, no buff may be running (so a card is never wasted), and the player must be able to spin
 * right now (so a buff is never started that cannot be used). Nothing changes on a refusal.
 */
export function spendLuckCard(s: LuckState, w: Wallet, cost: number): UseResult {
  if (s.buffRounds > 0) return { ok: false, code: "BUFF_ALREADY_ACTIVE" };
  if (s.cards < 1) return { ok: false, code: "NO_LUCK_CARDS" };
  if (!canSpinNow(w, cost)) return { ok: false, code: "INSUFFICIENT_COINS" };
  return { ok: true, state: { cards: s.cards - 1, buffRounds: BUFF_ROUNDS } };
}

/**
 * One spin (free or paid). The buff applies to THIS spin if it was active before it (buffApplied), then one round is used up;
 * a luck-card prize adds a card whatever the balance is (it cannot be used on the same spin that won it).
 * A spin the player cannot pay for never happens (the RPC rolls back), so it never uses a buff round: call this only for spins that ran.
 */
export function afterSpin(s: LuckState, wonLuckCard: boolean): { state: LuckState; buffApplied: boolean } {
  const buffApplied = s.buffRounds > 0;
  return {
    buffApplied,
    state: { cards: s.cards + (wonLuckCard ? 1 : 0), buffRounds: buffApplied ? s.buffRounds - 1 : 0 },
  };
}
