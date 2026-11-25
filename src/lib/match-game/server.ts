import "server-only";
import { bangkokDate } from "@/lib/cat-game/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { toMatchView, type MatchRoundView } from "./types";

/**
 * The verified user's unfinished round (if any), wallet balance and rounds started today, read on the server. Only what the player has already
 * seen is returned: the layout stays in the database. Used by the page and by GET /api/match-game/state.
 */
export async function loadMatchState(userId: string): Promise<{ round: MatchRoundView | null; balance: number; roundsToday: number; unavailable: boolean }> {
  const admin = createAdminClient();
  const [active, today, wallet] = await Promise.all([
    admin.from("match_game_rounds").select("id").eq("user_id", userId).eq("status", "active").maybeSingle(),
    admin.from("match_game_rounds").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("play_date", bangkokDate(new Date())),
    admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
  ]);
  const balance = wallet.data?.balance ?? 0;
  const roundsToday = today.count ?? 0;
  if (active.error || today.error) return { round: null, balance, roundsToday: 0, unavailable: true };
  if (!active.data) return { round: null, balance, roundsToday, unavailable: false };
  // the id comes from the user's own row above; match_view hides everything the player has not turned over
  const view = await admin.rpc("match_view", { p_round_id: active.data.id });
  if (view.error || !view.data) return { round: null, balance, roundsToday, unavailable: true };
  return { round: toMatchView(view.data as Parameters<typeof toMatchView>[0]), balance, roundsToday, unavailable: false };
}
