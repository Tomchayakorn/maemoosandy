import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toRoundView, type PowerRoundView } from "./types";

/** The verified user's unfinished round (if any) and wallet balance, read on the server. Used by the page and by GET /api/power-wheel/state. */
export async function loadPowerState(userId: string): Promise<{ round: PowerRoundView | null; balance: number; unavailable: boolean }> {
  const admin = createAdminClient();
  const [rounds, wallet] = await Promise.all([
    admin.from("power_wheel_rounds").select("id, bet, level, status, payout").eq("user_id", userId).eq("status", "active").maybeSingle(),
    admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
  ]);
  const balance = wallet.data?.balance ?? 0;
  const r = rounds.data;
  return {
    balance,
    unavailable: !!rounds.error,
    round: r ? toRoundView({ round_id: r.id, status: r.status, bet: r.bet, level: r.level, payout: r.payout, balance }) : null,
  };
}
