import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatGame } from "@/components/cat-game/CatGame";
import { CatGameRules } from "@/components/rules/CatGameRules";
import { RulesGate } from "@/components/rules/RulesGate";
import { bangkokDate, CAT_GAME_COST, CAT_REWARDS } from "@/lib/cat-game/config";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "น้องเหมียว 9 ชีวิต",
  description: "จิ้มน้องเหมียว 1 ตัวจาก 9 ตัว ลุ้นเหรียญ 200 / 300 / 400 / 500 / 1,000 เหรียญ เล่นได้วันละ 1 ครั้ง",
};

export default function CatGamePage() {
  return (
    // pb-32: keeps the last button clear of the floating LINE button (and the phone's safe area)
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-[max(8rem,calc(env(safe-area-inset-bottom)+7rem))] pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ จิ้มเหมียวเสี่ยงโชค ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">น้องเหมียว 9 ชีวิต</span>
        </h1>
        <p className="text-sm text-cream-muted">
          จิ้ม 1 ตัวจาก 9 ตัว · {CAT_GAME_COST} เหรียญ · วันละ 1 ครั้ง · รับ {CAT_REWARDS.map((r) => r.toLocaleString("th-TH")).join(" / ")} เหรียญ
        </p>
      </header>
      <Suspense fallback={null}>
        <RulesForUser />
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
  if (!user) redirect("/login?next=/cat-game");
  const supabase = await createClient();
  const [wallet, today] = await Promise.all([
    getMyWallet(),
    // my play for today's Bangkok date (RLS: own rows only); an error here means migration 0016 isn't installed
    supabase.from("cat_game_plays").select("reward_coins, cat_index").eq("play_date", bangkokDate(new Date())).maybeSingle(),
  ]);
  return (
    <CatGame
      initialBalance={wallet?.balance ?? 0}
      initialPlayed={today.data ? { reward: today.data.reward_coins, catIndex: today.data.cat_index } : null}
      unavailable={!!today.error}
    />
  );
}

/** The rules pop-up remembers its confirmation per user, so it needs the signed-in user's id (hence its own Suspense). */
async function RulesForUser() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return null; // the game's own gate redirects to /login
  return (
    <RulesGate game="cat-game" userId={user.id} title="กติกาการเล่นและการถอนเงิน" startLabel="ยืนยันกติกา เริ่มเล่นเกม">
      <CatGameRules />
    </RulesGate>
  );
}
