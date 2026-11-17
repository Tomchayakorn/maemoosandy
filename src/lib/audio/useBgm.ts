"use client";

import { useSyncExternalStore } from "react";
import { bgm, type BgmState } from "./bgm";

/** Live background-music state for UI (header toggle, etc.). */
export function useBgm(): BgmState {
  return useSyncExternalStore(bgm.subscribe, bgm.getSnapshot, bgm.getServerSnapshot);
}
