import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { HistoryTabs } from "./history-tabs";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ประวัติของฉัน", robots: { index: false } };

export default function HistoryPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-14 pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ บันทึกแห่งบ้าน ณ มัณตรา ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">ประวัติของฉัน</span>
        </h1>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-gold/5" />}>
        <HistoryData />
      </Suspense>
    </main>
  );
}

async function HistoryData() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/history");

  // Read through RLS with the user's own session: each query only sees this user's rows.
  const supabase = await createClient();
  const [topups, readings, spins] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, package_id, amount_thb, coins_added, status, failure_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("fortune_logs")
      .select("id, fortune_type, question, result_text, coins_spent, used_free_ticket, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("spin_logs")
      .select("id, reward_key, reward_type, reward_value, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return <HistoryTabs topups={topups.data ?? []} readings={readings.data ?? []} spins={spins.data ?? []} />;
}
