import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatSurpriseHost } from "@/components/cat-game/CatSurpriseHost";
import { PowerWheelGame } from "@/components/power-wheel/PowerWheelGame";
import { PowerWheelRules } from "@/components/rules/PowerWheelRules";
import { RulesGate } from "@/components/rules/RulesGate";
import { BETS, MAX_PAYOUT } from "@/lib/power-wheel/config";
import { loadPowerState, powerRulesVersion } from "@/lib/power-wheel/server";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "วงล้อไต่ชั้น",
  description: `หมุนวงล้อไต่ชั้นสะสมพลัง หยุดรับเหรียญหรือเสี่ยงหมุนต่อ เดิมพัน ${BETS.join("/")} เหรียญ โบนัสสูงสุดต่อรอบ ${MAX_PAYOUT.toLocaleString("th-TH")} เหรียญ`,
};

export default function PowerWheelPage() {
  return (
    // pb-32 + safe area: keeps the last button clear of the floating LINE button
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-[max(8rem,calc(env(safe-area-inset-bottom)+7rem))] pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ สะสมพลัง เสี่ยงข้ามชั้น ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">วงล้อไต่ชั้น</span>
        </h1>
        <p className="text-sm text-cream-muted">หมุนผ่านทีละชั้น พลังสะสมยิ่งสูง จะหยุดรับเหรียญหรือเสี่ยงต่อก็ได้</p>
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
  if (!user) redirect("/login?next=/power-wheel");
  const [state, rules] = await Promise.all([loadPowerState(user.id), powerRulesVersion()]);
  return <PowerWheelGame initialBalance={state.balance} unavailable={state.unavailable} initialRound={state.round} rules={rules} />;
}

/** The rules pop-up remembers its confirmation per user, so it needs the signed-in user's id (hence its own Suspense). */
async function RulesForUser() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return null;
  const rules = await powerRulesVersion();
  // new rules change the chances and what a level pays, so everyone is shown them once more (one confirmation key per version)
  const game = rules === 3 ? "power-wheel-bonus-v3" : rules === 2 ? "power-wheel-bonus" : "power-wheel";
  return (
    <RulesGate game={game} userId={user.id} title="กติกาการเล่น" startLabel="ยืนยันกติกา เริ่มเล่นเกม">
      <PowerWheelRules version={rules} />
    </RulesGate>
  );
}
