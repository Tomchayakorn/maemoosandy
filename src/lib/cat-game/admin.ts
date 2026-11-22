/**
 * Pure helpers for the admin tool that restores a player's daily chance in "น้องเหมียว 9 ชีวิต".
 * `applyAdminReset` is the reference model of the SQL function admin_reset_cat_game (migration 0017); the database is the source of truth.
 */
export type CatGameDayState = {
  balance: number;
  ledgerCoins: number; // sum of the ledger deltas of this game (-9 and +prize rows)
  todayPlay: { catIndex: number; reward: number } | null;
  resets: { removedReward: number; by: string }[];
};

export type AdminResetResult = { ok: true; state: CatGameDayState } | { ok: false; error: "NOTHING_TO_RESET" | "INVALID_AMOUNT" };

export function applyAdminReset(state: CatGameDayState, admin: string): AdminResetResult {
  if (!admin) return { ok: false, error: "INVALID_AMOUNT" };
  if (!state.todayPlay) return { ok: false, error: "NOTHING_TO_RESET" };
  return {
    ok: true,
    // balance and ledger are deliberately untouched; only today's play row goes away (and is logged)
    state: { ...state, todayPlay: null, resets: [...state.resets, { removedReward: state.todayPlay.reward, by: admin }] },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Find a user by exact id or exact (case-insensitive) email in a list of auth users. */
export function matchUser<T extends { id: string; email?: string | null }>(users: readonly T[], query: string): T | null {
  const q = query.trim();
  if (!q) return null;
  if (UUID.test(q)) return users.find((u) => u.id.toLowerCase() === q.toLowerCase()) ?? null;
  return users.find((u) => u.email?.toLowerCase() === q.toLowerCase()) ?? null;
}
