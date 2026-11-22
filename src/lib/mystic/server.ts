import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRoundView, type MysticRoundView } from "./types";

/**
 * The verified user's unfinished round (if any) and wallet balance, read on the server WITHOUT the mine_mask column: the rounds table has
 * no client policy because the cursed positions must stay secret. Used by the page and by GET /api/mystic/state.
 */
export async function loadMysticState(userId: string): Promise<{ round: MysticRoundView | null; balance: number; unavailable: boolean }> {
  const admin = createAdminClient();
  const [rounds, wallet] = await Promise.all([
    admin.from("mystic_chest_rounds").select("id, bet, mines, opened_mask, safe_count, status, payout").eq("user_id", userId).eq("status", "active").maybeSingle(),
    admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
  ]);
  const balance = wallet.data?.balance ?? 0;
  const r = rounds.data;
  return {
    balance,
    unavailable: !!rounds.error,
    round: r
      ? toRoundView({ round_id: r.id, status: r.status, bet: r.bet, mines: r.mines, opened_mask: r.opened_mask, safe_count: r.safe_count, payout: r.payout, mine_mask: null, balance })
      : null,
  };
}
