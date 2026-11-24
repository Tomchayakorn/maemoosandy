import type { PowerRoundView } from "./types";

/**
 * Decides whether a round state read from the server (GET /api/power-wheel/state) may replace what the screen already shows.
 *
 * Server side, a round's level only ever goes UP (power_spin sets level = level + 1 under the row lock) and a finished round never becomes
 * active again. So a server answer that says otherwise for the SAME round is an old one — a page restored from the browser's back/forward
 * cache, or a slow request that arrives after a newer result — and must be ignored instead of dragging the screen back to an earlier level.
 *
 * Returns `accepted: false` to keep the local state (and ignore the balance that came with it).
 */
export function reconcileRound(local: PowerRoundView | null, server: PowerRoundView | null): { accepted: boolean; round: PowerRoundView | null } {
  if (local && server && local.roundId === server.roundId) {
    // finished rounds stay finished
    if (local.status !== "active" && server.status === "active") return { accepted: false, round: local };
    // an active round never goes back to a lower level
    if (local.status === "active" && server.status === "active" && server.level < local.level) return { accepted: false, round: local };
  }
  return { accepted: true, round: server };
}
