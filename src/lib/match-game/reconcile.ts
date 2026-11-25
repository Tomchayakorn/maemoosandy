import type { MatchRoundView } from "./types";

/**
 * May a round state read from the server replace what the screen shows? On the server a round only moves forward (its step only grows and a
 * finished round never reopens), so an answer that goes backwards for the SAME round is an old one and is ignored.
 */
export function reconcileMatch(local: MatchRoundView | null, server: MatchRoundView | null): { accepted: boolean; round: MatchRoundView | null } {
  if (local && server && local.roundId === server.roundId) {
    if (local.status === "finished" && server.status === "active") return { accepted: false, round: local };
    if (server.step < local.step) return { accepted: false, round: local };
  }
  // a finished round is not returned by the state read (only unfinished ones are): keep its summary on screen
  if (local?.status === "finished" && !server) return { accepted: true, round: local };
  return { accepted: true, round: server };
}
