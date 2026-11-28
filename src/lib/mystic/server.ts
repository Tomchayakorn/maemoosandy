import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { RulesVersion } from "./config";
import { toRoundView, type MysticRoundView } from "./types";

/** The rules new rounds are played under: 2 (bonus rounds) once migration 0025 is installed, else 1. */
export async function mysticRulesVersion(): Promise<RulesVersion> {
  const { error } = await createAdminClient().rpc("mystic_bonus_unlock_count");
  return error ? 1 : 2;
}

/** The columns of an unfinished round that may be read for the player — never `mine_mask`. */
const ROUND_COLUMNS = "id, bet, mines, opened_mask, safe_count, status, payout";

/**
 * The verified user's unfinished round (if any) and wallet balance, read on the server WITHOUT the mine_mask column: the rounds table has
 * no client policy because the cursed positions must stay secret. Used by the page and by GET /api/mystic/state.
 */
export async function loadMysticState(userId: string): Promise<{ round: MysticRoundView | null; balance: number; unavailable: boolean }> {
  const admin = createAdminClient();
  const active = (columns: string) => admin.from("mystic_chest_rounds").select(columns).eq("user_id", userId).eq("status", "active").maybeSingle();
  const [withBonus, wallet] = await Promise.all([active(`${ROUND_COLUMNS}, bonus_version, bonus_multiplier`), admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle()]);
  // 42703 = no such column: migration 0025 is not installed yet
  const rounds = withBonus.error?.code === "42703" ? await active(ROUND_COLUMNS) : withBonus;
  const balance = wallet.data?.balance ?? 0;
  const r = rounds.data as unknown as Pick<
    Database["public"]["Tables"]["mystic_chest_rounds"]["Row"],
    "id" | "bet" | "mines" | "opened_mask" | "safe_count" | "status" | "payout" | "bonus_version" | "bonus_multiplier"
  > | null;
  return {
    balance,
    unavailable: !!rounds.error,
    round: r
      ? toRoundView({
          round_id: r.id,
          status: r.status,
          bet: r.bet,
          mines: r.mines,
          opened_mask: r.opened_mask,
          safe_count: r.safe_count,
          payout: r.payout,
          mine_mask: null,
          balance,
          bonus_version: r.bonus_version,
          bonus: r.bonus_multiplier,
        })
      : null,
  };
}
