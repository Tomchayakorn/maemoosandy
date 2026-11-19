import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LuckyCardGame } from "@/components/lucky-card/LuckyCardGame";
import { getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "ดวงดี มีเฮ",
  description: "เปิดไพ่ 1 ใบจาก 8 ใบ รอบละ 20 เหรียญ ลุ้นข้อความมงคล โบนัสเหรียญ และรางวัลลับ “เทพประทานทรัพย์”",
};

export default function LuckyCardPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-14 pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ เปิดไพ่ลุ้นโชค ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">ดวงดี มีเฮ</span>
        </h1>
        <p className="text-sm text-cream-muted">108 ข้อความมงคล · โบนัส 100 / 300 / 500 เหรียญ · รางวัลลับ “เทพประทานทรัพย์”</p>
      </header>
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
  const wallet = await getMyWallet();
  return <LuckyCardGame initialBalance={wallet?.balance ?? 0} />;
}
