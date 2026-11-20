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
