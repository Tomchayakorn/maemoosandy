import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CatGameAdmin } from "./cat-game-admin";
import { formatThaiDateTime } from "@/components/topup/topup-labels";
import { isAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "จัดการสิทธิ์น้องเหมียว 9 ชีวิต", robots: { index: false, follow: false } };

export default function AdminCatGamePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-32 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl text-gold-gradient">สิทธิ์เล่นน้องเหมียว 9 ชีวิต</h1>
        <Link href="/admin/withdrawals" className="text-sm text-gold-light underline">
          ไปหน้าคำขอถอน
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-gold/5" />}>
        <Data />
      </Suspense>
    </main>
  );
}

async function Data() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/cat-game");
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  const { data: resets, error } = await admin
    .from("cat_game_admin_resets")
    .select("id, user_id, play_date, removed_reward, reset_by, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <>
      <CatGameAdmin />
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg text-gold-light">รีเซ็ตล่าสุด</h2>
        {error ? (
          <p className="text-sm text-cream-muted">ยังไม่ได้รัน migration 0017 (ตารางบันทึกการรีเซ็ต)</p>
        ) : !resets || resets.length === 0 ? (
          <p className="text-sm text-cream-muted">ยังไม่มีการรีเซ็ต</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {resets.map((r) => (
              <li key={r.id} className="rounded-2xl border border-gold/25 bg-velvet/70 p-3 text-xs text-cream-muted">
                <span className="text-cream">{formatThaiDateTime(r.created_at)}</span> · วันที่เล่น {r.play_date} · รางวัลที่ถูกล้าง{" "}
                {r.removed_reward?.toLocaleString("th-TH") ?? "-"} เหรียญ
                <br />
                ผู้ใช้ <span className="break-all font-tarot">{r.user_id}</span> · โดย {r.reset_by}
                {r.reason ? ` · เหตุผล: ${r.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
