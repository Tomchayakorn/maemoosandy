/**
 * Remembers, per browser, that a player confirmed the rules of a game (display-only; nothing here touches coins or the server).
 * Key = game + user id + RULES_VERSION, so a different account on the same browser is asked again, and bumping
 * RULES_VERSION re-asks everyone after the rules change. Clearing the browser's site data clears it too.
 */
export type RulesGame = "wheel" | "lucky-card" | "cat-game";

export const RULES_VERSION = 1;

export function rulesConsentKey(game: RulesGame, userId: string): string {
  return `bnm:rules-ok:${game}:${userId}:v${RULES_VERSION}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// used when localStorage is unavailable (private mode / blocked): the confirmation then lasts until the tab is closed
const memory = new Set<string>();

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function hasConfirmedRules(key: string, store: StorageLike | null = storage()): boolean {
  if (memory.has(key)) return true;
  try {
    return store?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function saveRulesConfirmed(key: string, store: StorageLike | null = storage()): void {
  memory.add(key);
  try {
    store?.setItem(key, "1");
  } catch {
    /* quota / blocked: the in-memory copy above still covers this tab */
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: fires on a confirmation in this tab and on changes made in other tabs. */
export function subscribeRulesConsent(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = () => cb();
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function confirmRules(key: string): void {
  saveRulesConfirmed(key);
  listeners.forEach((l) => l());
}

/** Test helper. */
export function _resetRulesConsentMemory(): void {
  memory.clear();
}
