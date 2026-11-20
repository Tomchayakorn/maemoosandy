import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type LuckSnapshot = { cards: number; buff: number };

const MAX_ATTEMPTS = 8;

/**
 * Luck-card state for the NO-RPC fallback path (spin-direct.ts), which knows nothing about cards or the buff.
 * Without this, a fallback spin leaves wallets.luck_buff_rounds untouched ("stuck at 3/3") and drops a won card.
 * Returns null when the columns don't exist (migration 0010 not installed) — then there is no luck state to keep.
 */
export async function readLuck(admin: Admin, userId: string): Promise<LuckSnapshot | null> {
  const { data, error } = await admin.from("wallets").select("luck_cards, luck_buff_rounds").eq("user_id", userId).maybeSingle();
  if (error || !data || typeof data.luck_cards !== "number" || typeof data.luck_buff_rounds !== "number") return null;
  return { cards: data.luck_cards, buff: data.luck_buff_rounds };
}

/**
 * After a fallback spin ran: use up one buff round (if one was active) and add a won card. Compare-and-swap on the two
 * columns, retried, so a concurrent change is never overwritten. Mirrors what spin_wheel_cycle does in one statement.
 */
export async function applyLuckAfterSpin(admin: Admin, userId: string, wonCard: boolean): Promise<LuckSnapshot | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cur = await readLuck(admin, userId);
    if (!cur) return null;
    const next = { luck_cards: cur.cards + (wonCard ? 1 : 0), luck_buff_rounds: Math.max(cur.buff - (cur.buff > 0 ? 1 : 0), 0) };
    const { data: updated } = await admin
      .from("wallets")
      .update(next)
      .eq("user_id", userId)
      .eq("luck_cards", cur.cards)
      .eq("luck_buff_rounds", cur.buff)
      .select("luck_cards, luck_buff_rounds");
    if (updated?.length === 1) return { cards: updated[0].luck_cards, buff: updated[0].luck_buff_rounds };
  }
  console.error("lucky-wheel direct: could not update luck state", { userId });
  return null;
}

/**
 * Cash tally for the no-RPC fallback: add `credit` to wheel_cash_total with a compare-and-swap (same rule as spin_wheel_cycle:
 * the caller passes 0 for free-ticket spins, the jackpot and non-coin prizes). Returns the new total, or null when the column
 * doesn't exist (migration 0013 not installed) or the update could not be applied.
 */
export async function addWheelCash(admin: Admin, userId: string, credit: number): Promise<number | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: w, error } = await admin.from("wallets").select("wheel_cash_total").eq("user_id", userId).maybeSingle();
    if (error || !w || typeof w.wheel_cash_total !== "number") return null;
    if (credit <= 0) return w.wheel_cash_total;
    const { data: updated } = await admin
      .from("wallets")
      .update({ wheel_cash_total: w.wheel_cash_total + credit })
      .eq("user_id", userId)
      .eq("wheel_cash_total", w.wheel_cash_total)
      .select("wheel_cash_total");
    if (updated?.length === 1) return updated[0].wheel_cash_total;
  }
  console.error("lucky-wheel direct: could not add to the cash tally", { userId, credit });
  return null;
}
