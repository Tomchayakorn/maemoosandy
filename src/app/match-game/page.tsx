import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MatchGame } from "@/components/match-game/MatchGame";
import { MatchRules } from "@/components/rules/MatchRules";
import { RulesGate } from "@/components/rules/RulesGate";
import { CARDS, COST, DAILY_ROUNDS, MAX_PAYOUT } from "@/lib/match-game/config";
import { loadMatchState } from "@/lib/match-game/server";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "จับคู่ภาพเหมือน",
  description: `เปิดไพ่ ${CARDS} ใบ จับคู่สัญลักษณ์มงคล รอบละ ${COST} เหรียญ รับสูงสุด ${MAX_PAYOUT} เหรียญ เล่นได้วันละ ${DAILY_ROUNDS} รอบ`,
};

export default function MatchGamePage() {
  return (
    // bottom padding + safe area: keeps the last cards clear of the floating LINE button
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-[max(8rem,calc(env(safe-area-inset-bottom)+7rem))] pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ ฝึกจิต จำแม่น เสริมดวง ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">จับคู่ภาพเหมือน</span>
        </h1>
        <p className="text-sm text-cream-muted">เปิดไพ่ทีละคู่ จดจำสัญลักษณ์มงคลของแม่มูให้ครบทั้งกระดาน</p>
      </header>
      <Suspense fallback={null}>
        <RulesForUser />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-gold/5" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/match-game");
  const state = await loadMatchState(user.id);
  return <MatchGame initialBalance={state.balance} initialRound={state.round} initialRoundsToday={state.roundsToday} unavailable={state.unavailable} />;
}

/** The rules pop-up remembers its confirmation per user, so it needs the signed-in user's id (hence its own Suspense). */
async function RulesForUser() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <RulesGate game="match-game" userId={user.id} title="กติกาการเล่น" startLabel="ยืนยันกติกา เริ่มเล่นเกม">
      <MatchRules />
    </RulesGate>
  );
}
