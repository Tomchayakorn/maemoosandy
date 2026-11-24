import { nextPlayAt } from "./config";

/** Milliseconds until the daily chance resets (the next 00:00 in Bangkok). Never negative. */
export function msUntilReset(now: Date): number {
  return Math.max(0, nextPlayAt(now).getTime() - now.getTime());
}

/** HH:MM:SS (hours may exceed 2 digits only if given more than 99 h; the daily reset never does). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
