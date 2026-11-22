import { CAT_GAME_COST } from "./config";

/**
 * "Surprise" pop-up rules for น้องเหมียว 9 ชีวิต (display only; the server enforces the real rules in play_cat_game).
 * The upper bound is 50 = the price of one wheel spin (the wheel costs 50, a lucky-card round 20), i.e. "a player who is about to run out".
 *   - 9..50 coins and today's play not used -> "offer"  (you can play right now)
 *   - 0..8 coins and today's play not used  -> "low" (need at least 9 coins to start; top up)
 *   - otherwise (more than 50 coins, or already played today) -> no pop-up
 */
export const SURPRISE_MAX_BALANCE = 50;
export type SurpriseState = "offer" | "low";

export function catSurpriseState(balance: number, playedToday: boolean): SurpriseState | null {
  if (playedToday || !Number.isFinite(balance) || balance < 0 || balance > SURPRISE_MAX_BALANCE) return null;
  return balance >= CAT_GAME_COST ? "offer" : "low";
}

/** Dismissal is remembered per user + state + Bangkok day, for this browser session only, so a closed pop-up does not come back. */
export function surpriseDismissKey(userId: string, state: SurpriseState, bangkokDay: string): string {
  return `bnm:cat-surprise:${userId}:${state}:${bangkokDay}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const memory = new Set<string>(); // used when sessionStorage is blocked: lasts until the tab closes
const listeners = new Set<() => void>();

function session(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function isSurpriseDismissed(key: string, store: StorageLike | null = session()): boolean {
  if (memory.has(key)) return true;
  try {
    return store?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function dismissSurprise(key: string, store: StorageLike | null = session()): void {
  memory.add(key);
  try {
    store?.setItem(key, "1");
  } catch {
    /* blocked: the in-memory copy covers this tab */
  }
  listeners.forEach((l) => l());
}

export function subscribeSurprise(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Test helper. */
export function _resetSurpriseMemory(): void {
  memory.clear();
}
