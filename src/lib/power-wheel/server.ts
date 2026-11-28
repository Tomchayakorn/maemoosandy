import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RulesVersion } from "./config";
import { toRoundView, type PowerRoundView } from "./types";

/** The rules new rounds are played under, from what is installed in the database: 3 (migration 0024), 2 (0023) or 1. */
export async function powerRulesVersion(): Promise<RulesVersion> {
  const admin = createAdminClient();
  const [v3, v2] = await Promise.all([admin.rpc("power_bonus_for_roll_v3", { p_roll: 0 }), admin.rpc("power_bonus_unlock_level")]);
  if (!v3.error) return 3;
  return v2.error ? 1 : 2;
}

/** The verified user's unfinished round (if any) and wallet balance, read on the server. Used by the page and by GET /api/power-wheel/state. */
export async function loadPowerState(userId: string): Promise<{ round: PowerRoundView | null; balance: number; unavailable: boolean }> {
  const admin = createAdminClient();
  const [rounds, wallet] = await Promise.all([
    // "*": the bonus columns only exist after migration 0023; the row never leaves the server as it is
    admin.from("power_wheel_rounds").select("*").eq("user_id", userId).eq("status", "active").maybeSingle(),
    admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
  ]);
  const balance = wallet.data?.balance ?? 0;
  const r = rounds.data;
  return {
    balance,
    unavailable: !!rounds.error,
    round: r
      ? toRoundView({ round_id: r.id, status: r.status, bet: r.bet, level: r.level, payout: r.payout, balance, bonus_version: r.bonus_version, bonus: r.bonus_multiplier })
      : null,
  };
}
