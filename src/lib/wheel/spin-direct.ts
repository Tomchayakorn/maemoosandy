import "server-only";

import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isJackpotPaidSpin } from "./rewards";
import { grantLocalQuota, localFallbackEnabled } from "../withdrawals-local";
import type { WheelSegment } from "./segments";

type Admin = ReturnType<typeof createAdminClient>;

export type DirectSpinResult = {
  paid: boolean;
  jackpot: boolean;
  balance: number;
  spinTickets: number;
  freeReadingTickets: number;
};

type Insertable = { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };
type Failure = { data: null; error: { message: string } };

const MAX_ATTEMPTS = 8;

/** Paid-spin claims are serialised per server instance so two spins here never take the same number. */
let claimQueue: Promise<unknown> = Promise.resolve();
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = claimQueue.then(fn, fn);
  claimQueue = run.catch(() => undefined);
  return run;
}

/**
 * FALLBACK for databases where migration 0004 (`spin_wheel_cycle`) has not been run. It needs NO new table or function.
 * Same rules as the RPC: free ticket first, else `cost` coins; a free spin never counts and never wins the jackpot;
 * every `jackpotEvery`-th PAID spin wins the jackpot.
 *
 * The global paid-spin number is not a stored counter: it is the rank of this spin's -cost ledger row among all
 * `wallet_ledger` rows with reason 'spin' and coins_delta = -cost (that data already exists and is permanent).
 *
 * Safety without a transaction: every wallet UPDATE is a compare-and-swap (applies only if the balances are still exactly
 * what we read; the loser re-reads), so one ticket/coins can never be spent twice. Order: 1) charge, 2) record the paid
 * ledger row (needed for the number; if it fails the charge is returned), 3) choose the reward, 4) credit the prize.
 * Never reachable from the browser: the route verifies the user first. Deliberate deviation from "RPCs only" (owner-approved).
 */
export async function spinDirect(
  admin: Admin,
  userId: string,
  standard: WheelSegment,
  jackpot: WheelSegment,
  cost: number,
  jackpotEvery: number,
): Promise<{ data: DirectSpinResult; error: null } | Failure> {
  // ---- 1) charge (CAS) ----
  let paid = false;
  let charged = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !charged; attempt++) {
    const { data: w, error } = await admin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (error) return { data: null, error: { message: error.message } };
    if (!w) return { data: null, error: { message: "WALLET_NOT_FOUND" } };
    paid = w.spin_tickets < 1;
    if (paid && w.balance < cost) return { data: null, error: { message: "INSUFFICIENT_COINS" } };

    const { data: updated, error: updErr } = await admin
      .from("wallets")
      .update({ balance: w.balance - (paid ? cost : 0), spin_tickets: w.spin_tickets - (paid ? 0 : 1) })
      .eq("user_id", userId)
      .eq("balance", w.balance)
      .eq("spin_tickets", w.spin_tickets)
      .select("balance");
    if (updErr) return { data: null, error: { message: updErr.message } };
    charged = (updated?.length ?? 0) === 1;
  }
  if (!charged) return { data: null, error: { message: "สถานะกระเป๋าเหรียญเปลี่ยนระหว่างหมุน กรุณาลองใหม่" } };

  const spinId = randomUUID();
  const ledger = admin.from("wallet_ledger") as unknown as Insertable;
  const logs = admin.from("spin_logs") as unknown as Insertable;

  // ---- 2) + 3) paid spin: record the -cost row, rank it, decide jackpot ----
  let isJackpot = false;
  if (paid) {
    const ranked = await serialised(async () => {
      const { data: row, error: insErr } = await admin
        .from("wallet_ledger")
        .insert({ user_id: userId, reason: "spin", coins_delta: -cost, ref_id: spinId } as never)
        .select("id, created_at")
        .single();
      if (insErr || !row) return { ok: false as const, message: insErr?.message ?? "ledger insert failed" };

      const { count, error: cntErr } = await admin
        .from("wallet_ledger")
        .select("id", { count: "exact", head: true })
        .eq("reason", "spin")
        .eq("coins_delta", -cost)
        .or(`created_at.lt.${row.created_at},and(created_at.eq.${row.created_at},id.lte.${row.id})`);
      if (cntErr || count === null) return { ok: false as const, message: cntErr?.message ?? "count failed", rowId: row.id };
      return { ok: true as const, number: count };
    });

    if (!ranked.ok) {
      // could not number the spin: give the coins back and fail cleanly
      await refundCharge(admin, userId, cost);
      if ("rowId" in ranked && ranked.rowId) await admin.from("wallet_ledger").delete().eq("id", ranked.rowId);
      return { data: null, error: { message: ranked.message } };
    }
    isJackpot = isJackpotPaidSpin(ranked.number, jackpotEvery);
  } else {
    await ledger.insert({ user_id: userId, reason: "spin", spin_tickets_delta: -1, ref_id: spinId }); // best-effort
  }

  // ---- 4) credit the prize (CAS increment) ----
  const reward = isJackpot ? jackpot : standard;
  const prize = reward.type === "coins" ? reward.value : 0;
  const freeGain = reward.type === "free_reading" ? reward.value : 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: w, error } = await admin.from("wallets").select("*").eq("user_id", userId).maybeSingle();
    if (error || !w) {
      console.error("lucky-wheel direct: wallet re-read failed", error?.message);
      continue;
    }
    const { data: updated } = await admin
      .from("wallets")
      .update({
        balance: w.balance + prize,
        free_reading_tickets: w.free_reading_tickets + freeGain,
        // only the real jackpot grants cash-withdrawal eligibility (needs migration 0005's column)
        ...(isJackpot && w.jackpot_withdrawals_available !== undefined ? { jackpot_withdrawals_available: w.jackpot_withdrawals_available + 1 } : {}),
      })
      .eq("user_id", userId)
      .eq("balance", w.balance)
      .eq("free_reading_tickets", w.free_reading_tickets)
      .select("balance, spin_tickets, free_reading_tickets");
    if (updated?.length === 1) {
      const row = updated[0];
      // column missing (0005 not run): record the right in the dev fallback store (never in production)
      if (isJackpot && w.jackpot_withdrawals_available === undefined && localFallbackEnabled()) await grantLocalQuota(userId);
      // history rows: best-effort, never fail the spin
      await logs.insert({ id: spinId, user_id: userId, reward_key: reward.key, reward_type: reward.type, reward_value: reward.value });
      if (prize > 0 || freeGain > 0) {
        await ledger.insert({
          user_id: userId,
          reason: "spin",
          coins_delta: prize,
          free_reading_tickets_delta: freeGain,
          ref_id: spinId,
        });
      }
      return {
        data: {
          paid,
          jackpot: isJackpot,
          balance: row.balance,
          spinTickets: row.spin_tickets,
          freeReadingTickets: row.free_reading_tickets,
        },
        error: null,
      };
    }
  }
  console.error("lucky-wheel direct: could not credit prize", { userId, reward: reward.key, spinId });
  return { data: null, error: { message: "บันทึกรางวัลไม่สำเร็จ กรุณาแจ้งผู้ดูแล (รหัส " + spinId.slice(0, 8) + ")" } };
}

/** Put `cost` coins back (CAS increment). Used only if a paid spin could not be numbered. */
async function refundCharge(admin: Admin, userId: string, cost: number) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: w } = await admin.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
    if (!w) return;
    const { data: u } = await admin.from("wallets").update({ balance: w.balance + cost }).eq("user_id", userId).eq("balance", w.balance).select("balance");
    if (u?.length === 1) return;
  }
  console.error("lucky-wheel direct: refund failed", { userId, cost });
}
