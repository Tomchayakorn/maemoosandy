import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TopupExperience, type RecentTopup } from "./topup-experience";
import { PACKAGES } from "@/lib/packages";
import { promptPayQr, promptPayReceiverName, type PromptPayQr } from "@/lib/promptpay";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getMyWallet } from "@/lib/wallet";

export const metadata: Metadata = {
  title: "เติมเหรียญ",
  robots: { index: false },
  description: "เติมเหรียญผ่านพร้อมเพย์ แนบสลิป รับเหรียญทันทีหลังตรวจสอบ",
};

export default function TopupPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-14 pt-8">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ เติมเหรียญเสริมบารมี ✦</p>
        <h1 className="font-display text-4xl leading-snug">
          <span className="text-gold-gradient">เติมเหรียญ</span>
        </h1>
        <p className="text-sm text-cream-muted">สแกนพร้อมเพย์ แนบสลิป รับเหรียญทันทีหลังตรวจสอบ</p>
      </header>

      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-3xl bg-gold/5" />}>
        <TopupGate />
      </Suspense>
    </main>
  );
}

async function TopupGate() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/topup");

  const supabase = await createClient();
  const [wallet, recent, ...qrList] = await Promise.all([
    getMyWallet(),
    supabase
      .from("transactions")
      .select("id, package_id, amount_thb, coins_added, status, failure_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    ...PACKAGES.map((p) => promptPayQr(p.priceThb)),
  ]);

  const qrs = Object.fromEntries(PACKAGES.map((p, i) => [p.id, qrList[i]])) as Record<string, PromptPayQr>;

  return (
    <TopupExperience
      initialBalance={wallet?.balance ?? 0}
      qrs={qrs}
      receiverName={process.env.SHOP_BANK_ACCOUNT_NAME?.trim() || promptPayReceiverName()}
      shopAccountNo={process.env.SHOP_BANK_ACCOUNT_NO?.trim() || null}
      recent={(recent.data ?? []) as RecentTopup[]}
    />
  );
}
