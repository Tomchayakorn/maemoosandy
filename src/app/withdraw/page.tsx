import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { WithdrawForm } from "./withdraw-form";
import { BonusWithdrawCard } from "@/components/lucky-card/BonusWithdrawCard";
import { PendingPrizeList } from "@/components/lucky-card/PendingPrizeList";
import { JackpotBanner } from "@/components/withdraw/JackpotBanner";
import { MysticCard } from "@/components/ui/MysticCard";
import { formatThaiDateTime } from "@/components/topup/topup-labels";
import { DevGrantButton } from "./dev-grant-button";
import { isAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalQuota, listLocalRequests, localFallbackEnabled, shouldUseLocalWithdrawals } from "@/lib/withdrawals-local";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";
import { BONUS_TARGET } from "@/lib/lucky-card/bonus";
import { WITHDRAW_COINS, WITHDRAW_SOURCE_LABEL, WITHDRAW_STATUS_LABEL, type WithdrawSource } from "@/lib/withdrawals";

export const metadata: Metadata = { title: "ถอนรางวัลแจ็กพอต", robots: { index: false } };

export default function WithdrawPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-14 pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ รางวัลแจ็กพอตใหญ่ ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">ถอนรางวัลแจ็กพอต</span>
        </h1>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-gold/5" />}>
        <WithdrawData />
      </Suspense>
    </main>
  );
}

const STATUS_TONE = { pending: "text-gold-light", approved: "text-emerald-300", rejected: "text-rose-300" } as const;

async function WithdrawData() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/withdraw");

  const supabase = await createClient();
  const [wallet, requests, prizes] = await Promise.all([
    getMyWallet(),
    supabase
      .from("withdrawal_requests")
      .select("id, amount_thb, bank_name, account_number, account_name, status, created_at, source")
      .order("created_at", { ascending: false })
      .limit(30),
    // saved "ถอนทีหลัง" prizes from ดวงดี มีเฮ (RLS: own rows only; empty if migration 0006 isn't installed)
    supabase
      .from("lucky_card_prizes")
      .select("id, amount_thb, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);
  const pendingPrizes = (prizes.data ?? []).map((p) => ({ ...p, label: formatThaiDateTime(p.created_at) }));
  const local = await shouldUseLocalWithdrawals(createAdminClient());
  const quota = local ? await getLocalQuota(user.id) : (wallet?.jackpot_withdrawals_available ?? 0);
  const history = (local ? await listLocalRequests(user.id) : (requests.data ?? [])).map((r) => ({
    ...r,
    source: (("source" in r && r.source) || "jackpot") as WithdrawSource,
  }));
  // accumulated "ดวงดี มีเฮ" bonus: shown while it is ready (>= 1,000) or a request is waiting for the admin
  const bonusTotal = wallet?.lucky_card_bonus_total ?? 0;
  const bonusPending = history.some((r) => r.source === "lucky_card_bonus" && r.status === "pending");
  const showBonusCard = bonusPending || bonusTotal >= BONUS_TARGET;
  const showDev = process.env.NEXT_PUBLIC_SHOW_TEST_CONTROLS === "true" && localFallbackEnabled() && isAdminUser(user);
  const balance = wallet?.balance ?? 0;

  return (
    <>
      {showBonusCard && <BonusWithdrawCard total={bonusTotal} pending={bonusPending} />}
      <PendingPrizeList prizes={pendingPrizes} />

      {quota > 0 ? (
        <>
          <JackpotBanner count={quota} />
          <WithdrawForm balance={balance} />
        </>
      ) : pendingPrizes.length > 0 || showBonusCard ? null : (
        <MysticCard className="p-5 text-center text-sm text-cream-muted">
          ตอนนี้คุณยังไม่มีสิทธิ์ถอนเงิน สิทธิ์นี้ได้รับเฉพาะผู้ที่ถูกรางวัลแจ็กพอตใหญ่ {WITHDRAW_COINS.toLocaleString("th-TH")} เหรียญจากกงล้อมหาเฮง หรือรางวัลลับ “เทพประทานทรัพย์” จากเกมดวงดี มีเฮเท่านั้น
        </MysticCard>
      )}

      {showDev && (
        <div className="flex justify-center">
          <DevGrantButton />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg text-gold-light">ประวัติคำขอถอน</h2>
        {history.length === 0 ? (
          <p className="rounded-2xl border border-gold/15 bg-velvet/50 px-4 py-6 text-center text-sm text-cream-muted">ยังไม่มีคำขอถอน</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((r) => (
              <li key={r.id} className="rounded-2xl border border-gold/20 bg-velvet/60 px-4 py-3 text-sm">
                <p className="mb-1 inline-block rounded-full border border-gold/30 px-2 py-0.5 text-[11px] text-gold-light">
                  {WITHDRAW_SOURCE_LABEL[r.source]}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <b className="text-cream">{r.amount_thb.toLocaleString("th-TH")} บาท</b>
                  <span className={STATUS_TONE[r.status]}>{WITHDRAW_STATUS_LABEL[r.status]}</span>
                </div>
                <p className="mt-1 text-xs text-cream-muted">
                  {r.bank_name} · {r.account_number} · {r.account_name}
                </p>
                <p className="text-xs text-cream-muted">{formatThaiDateTime(r.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
