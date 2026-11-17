import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BirthdateExperience } from "./birthdate-experience";
import { TarotRoomBackground } from "@/components/tarot/TarotRoomBackground";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";
import { FORTUNE_PRICES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "ตรวจดวงชะตาจากชื่อและวันเดือนปีเกิด",
  description: "ถอดรหัสเลขศาสตร์ชื่อ-สกุล ทักษา ปีนักษัตร และราศี พร้อมสีและเลขมงคลเฉพาะตัว โดยแม่มูแซนดี้",
};

export default function BirthdatePage() {
  return (
    // `isolate`: the -z-10 room backdrop sits behind this page's content but above <body>'s background.
    <main className="relative isolate mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-14 pt-6">
      <TarotRoomBackground />

      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="on-photo font-serif text-xs tracking-[0.25em] text-gold-light">✦ ศาสตร์แห่งชื่อและวันเกิด ✦</p>
        <h1 className="font-display text-4xl leading-snug drop-shadow-[0_2px_10px_rgb(0_0_0/0.9)]">
          <span className="text-gold-gradient">ตรวจดวงชะตา</span>
        </h1>
        <p className="on-photo text-sm text-cream">
          เลขศาสตร์ · ทักษา · ปีนักษัตร · ราศี — {FORTUNE_PRICES.birthdate} เหรียญ
        </p>
      </header>

      <Suspense fallback={<div className="mt-[34svh] h-96 animate-pulse rounded-3xl bg-velvet/60" />}>
        <BirthdateGate />
      </Suspense>
    </main>
  );
}

async function BirthdateGate() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/birthdate");

  const wallet = await getMyWallet();
  return (
    <BirthdateExperience
      initialBalance={wallet?.balance ?? 0}
      initialFreeTickets={wallet?.free_reading_tickets ?? 0}
    />
  );
}
