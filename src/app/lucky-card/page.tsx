import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LuckyCardRules } from "@/components/rules/LuckyCardRules";
import { CatSurpriseHost } from "@/components/cat-game/CatSurpriseHost";
import { RulesGate } from "@/components/rules/RulesGate";
import { LuckyCardGame } from "@/components/lucky-card/LuckyCardGame";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "ดวงดี มีเฮ",
  description: "เปิดไพ่ 1 ใบจาก 8 ใบ รอบละ 20 เหรียญ ลุ้นข้อความมงคล โบนัสเหรียญ และรางวัลลับ “เทพประทานทรัพย์”",
};

export default function LuckyCardPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-32 pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ เปิดไพ่ลุ้นโชค ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">ดวงดี มีเฮ</span>
        </h1>
        <p className="text-sm text-cream-muted">108 ข้อความมงคล · โบนัส 100 / 300 / 500 เหรียญ · รางวัลลับ “เทพประทานทรัพย์”</p>
      </header>
      <Suspense fallback={null}>
        <RulesForUser />
      </Suspense>
      <Suspense fallback={null}>
        <CatSurpriseHost />
      </Suspense>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-3xl bg-gold/5" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/lucky-card");
  const [wallet, pending] = await Promise.all([
    getMyWallet(),
    // own pending bonus cash-out request (RLS: own rows only)
    createClient().then((sb) =>
      sb.from("withdrawal_requests").select("id").eq("source", "lucky_card_bonus").eq("status", "pending").maybeSingle(),
    ),
  ]);
  return (
    <LuckyCardGame
      initialBalance={wallet?.balance ?? 0}
      initialBonusTotal={wallet?.lucky_card_bonus_total ?? 0}
      initialBonusPending={!!pending.data}
      initialGuarantee={
        wallet && typeof wallet.lucky_card_cycle_rounds === "number"
          ? { dryRounds: wallet.lucky_card_dry_rounds ?? 0, cycleRounds: wallet.lucky_card_cycle_rounds }
          : null
      }
    />
  );
}

/** The rules pop-up remembers its confirmation per user, so it needs the signed-in user's id (hence its own Suspense). */
async function RulesForUser() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return null; // the game's own gate redirects to /login
  return (
    <RulesGate game="lucky-card" userId={user.id} title="กติกาการเล่นและการถอนเงิน" startLabel="ยืนยันกติกา เริ่มเล่นเกม">
      <LuckyCardRules />
    </RulesGate>
  );
}
