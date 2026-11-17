import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TarotExperience } from "./tarot-experience";
import { TarotRoomBackground } from "@/components/tarot/TarotRoomBackground";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";
import { FORTUNE_PRICES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "เปิดไพ่ยิปซีสื่อจิต 3 ใบ",
  description: "ตั้งจิตอธิษฐาน ถามเรื่องที่ค้างคาใจ แล้วให้แม่มูแซนดี้เปิดไพ่ยิปซี อดีต ปัจจุบัน อนาคต",
};

export default function TarotPage() {
  return (
    // `isolate` makes main its own stacking context, so the -z-10 backdrop sits behind
    // this page's content but still above <body>'s own background.
    <main className="relative isolate mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-14 pt-6">
      <TarotRoomBackground />

      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="on-photo font-serif text-xs tracking-[0.25em] text-gold-light">✦ ไพ่ยิปซีสื่อจิต ✦</p>
        <h1 className="font-display text-4xl leading-snug drop-shadow-[0_2px_10px_rgb(0_0_0/0.9)]">
          <span className="text-gold-gradient">เปิดไพ่ 3 ใบ</span>
        </h1>
        <p className="on-photo text-sm text-cream">อดีต · ปัจจุบัน · อนาคต — {FORTUNE_PRICES.tarot} เหรียญ</p>
      </header>

      <Suspense fallback={<div className="mt-[34svh] h-80 animate-pulse rounded-3xl bg-velvet/60" />}>
        <TarotGate />
      </Suspense>
    </main>
  );
}

async function TarotGate() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/tarot");

  const wallet = await getMyWallet();
  return (
    <TarotExperience
      initialBalance={wallet?.balance ?? 0}
      initialFreeTickets={wallet?.free_reading_tickets ?? 0}
    />
  );
}
