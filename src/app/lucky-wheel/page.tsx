import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { WheelExperience } from "./wheel-experience";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalQuota, shouldUseLocalWithdrawals } from "@/lib/withdrawals-local";
import { JackpotBanner } from "@/components/withdraw/JackpotBanner";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";
import { smallTierUsage, type CashRequestRow } from "@/lib/wheel/cash";

export const metadata: Metadata = {
  title: "กงล้อมหาเฮง",
  description: "หมุนกงล้อลุ้นเหรียญโบนัส สิทธิ์ดูดวงฟรี และแจ็กพอต 5,000 เหรียญ เช็กอินทุกวันรับสิทธิ์หมุนเพิ่ม",
};

export default function LuckyWheelPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-28 pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ ลุ้นโชคเสริมดวง ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">กงล้อมหาเฮง</span>
        </h1>
        <p className="text-sm text-cream-muted">หมุนลุ้นเหรียญโบนัส สิทธิ์ดูดวงฟรี และแจ็กพอต 5,000 เหรียญ</p>
      </header>

      <Suspense fallback={<div className="mx-auto aspect-square w-full animate-pulse rounded-full bg-gold/5" />}>
        <WheelGate />
      </Suspense>
    </main>
  );
}

/** Today's date in Bangkok as YYYY-MM-DD (matches public.bangkok_today()). */
function bangkokToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

async function WheelGate() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/lucky-wheel");

  const supabase = await createClient();
  const today = bangkokToday();
  const [wallet, checkin, cashRows] = await Promise.all([
    getMyWallet(),
    supabase.from("daily_checkins").select("checkin_date").eq("checkin_date", today).maybeSingle(),
    // my wheel cash-out requests (RLS: own rows only): pending state + small-tier quota used today / this week
    supabase.from("withdrawal_requests").select("amount_thb, status, created_at").eq("source", "wheel_cash").order("created_at", { ascending: false }).limit(60),
  ]);
  const cash = (cashRows.data ?? []) as CashRequestRow[];
  const cashPending = cash.some((r) => r.status === "pending");
  const cashUsage = smallTierUsage(cash, new Date());

  const admin = createAdminClient();
  const quota = (await shouldUseLocalWithdrawals(admin)) ? await getLocalQuota(user.id) : (wallet?.jackpot_withdrawals_available ?? 0);

  return (
    <>
      <WheelExperience
      initialTickets={wallet?.spin_tickets ?? 0}
      initialBalance={wallet?.balance ?? 0}
      initialCheckedIn={!!checkin.data}
      initialFreeReadings={wallet?.free_reading_tickets ?? 0}
      initialLuckCards={wallet?.luck_cards ?? 0}
      initialLuckBuffRounds={wallet?.luck_buff_rounds ?? 0}
      initialWheelCash={typeof wallet?.wheel_cash_total === "number" ? wallet.wheel_cash_total : null}
      initialCashPending={cashPending}
      initialCashUsage={cashUsage}
      />
      {quota > 0 && <JackpotBanner count={quota} />}
    </>
  );
}
