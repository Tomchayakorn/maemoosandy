"use client";

import { useEffect, useId } from "react";

/**
 * Lets other pop-ups / results say "I am on screen, don't show the cat-game surprise now".
 * The surprise waits (it is not dropped): as soon as the last blocker goes away it can appear.
 * Used by the rules pop-up (RulesGate), the wheel's result modal / spin, and the lucky card's round + result.
 */
const blockers = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function addSurpriseBlock(id: string): void {
  if (blockers.has(id)) return;
  blockers.add(id);
  notify();
}

export function removeSurpriseBlock(id: string): void {
  if (blockers.delete(id)) notify();
}

export function hasSurpriseBlock(): boolean {
  return blockers.size > 0;
}

export function subscribeSurpriseBlock(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** React hook: while `active` is true this component blocks the surprise pop-up. */
export function useSurpriseBlock(active: boolean): void {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    addSurpriseBlock(id);
    return () => removeSurpriseBlock(id);
  }, [active, id]);
}

/** Test helper. */
export function _resetSurpriseBlocks(): void {
  blockers.clear();
}
