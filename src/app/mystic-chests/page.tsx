import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatSurpriseHost } from "@/components/cat-game/CatSurpriseHost";
import { MysticGame } from "@/components/mystic/MysticGame";
import { MysticRules } from "@/components/rules/MysticRules";
import { RulesGate } from "@/components/rules/RulesGate";
import { BETS, MAX_PAYOUT } from "@/lib/mystic/config";
import { loadMysticState } from "@/lib/mystic/server";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "เปิดหีบมนตรา",
  description: `เปิดหีบสะสมตัวคูณ หลบจุดอาถรรพ์ แล้วกดรับเหรียญเมื่อไรก็ได้ เดิมพัน ${BETS.join("/")} เหรียญ รับสูงสุด ${MAX_PAYOUT.toLocaleString("th-TH")} เหรียญต่อรอบ`,
};

export default function MysticChestsPage() {
  return (
    // pb-32 + safe area: keeps the last button clear of the floating LINE button
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-[max(8rem,calc(env(safe-area-inset-bottom)+7rem))] pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ วัดใจ ลุ้นตัวคูณ ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">เปิดหีบมนตรา</span>
        </h1>
        <p className="text-sm text-cream-muted">เปิดหีบสะสมตัวคูณ หลบจุดอาถรรพ์ แล้วกดรับเหรียญเมื่อไรก็ได้</p>
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
  if (!user) redirect("/login?next=/mystic-chests");
  const state = await loadMysticState(user.id);
  return <MysticGame initialBalance={state.balance} unavailable={state.unavailable} initialRound={state.round} />;
}

/** The rules pop-up remembers its confirmation per user, so it needs the signed-in user's id (hence its own Suspense). */
async function RulesForUser() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <RulesGate game="mystic-chests" userId={user.id} title="กติกาการเล่นและการถอนเงิน" startLabel="ยืนยันกติกา เริ่มเล่นเกม">
      <MysticRules />
    </RulesGate>
  );
}
