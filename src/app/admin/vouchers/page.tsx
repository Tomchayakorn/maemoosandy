import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VoucherAdmin, type VoucherListItem } from "./voucher-admin";
import { formatThaiDateTime } from "@/components/topup/topup-labels";
import { isAdminUser } from "@/lib/admin";
import { alertAdminError } from "@/lib/admin-alert";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { voucherStatus } from "@/lib/voucher";

export const metadata: Metadata = { title: "จัดการโค้ดลับจากแม่มู", robots: { index: false, follow: false } };

export default function AdminVouchersPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-32 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl text-gold-gradient">โค้ดลับจากแม่มู</h1>
        <span className="flex gap-3 text-sm text-gold-light">
          <Link href="/admin/withdrawals" className="underline">คำขอถอน</Link>
          <Link href="/admin/cat-game" className="underline">สิทธิ์น้องเหมียว</Link>
        </span>
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
  if (!user) redirect("/login?next=/admin/vouchers");
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  const [vouchers, redemptions] = await Promise.all([
    admin.from("voucher_codes").select("id, code, coins, max_redemptions, redeemed_count, expires_at, is_active, note, created_by, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("voucher_redemptions").select("id, voucher_id, user_id, coins, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  if (vouchers.error || redemptions.error) {
    const e = vouchers.error ?? redemptions.error!;
    if (e.code !== "42P01" && e.code !== "PGRST205") await alertAdminError({ where: "หน้า /admin/vouchers: อ่านโค้ดลับ", error: e });
    return <p className="rounded-2xl border border-gold/30 bg-velvet/70 p-4 text-sm text-gold-light">ยังไม่ได้รัน migration 0019 (ตารางโค้ดลับ) ใน Supabase</p>;
  }

  const now = new Date();
  const list: VoucherListItem[] = (vouchers.data ?? []).map((v) => ({ ...v, status: voucherStatus(v, now) }));
  const codeOf = new Map(list.map((v) => [v.id, v.code]));

  // who redeemed (email via the auth admin API, only for the ≤50 listed rows)
  const ids = [...new Set((redemptions.data ?? []).map((r) => r.user_id))];
  const emails = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data.user?.email) emails.set(id, data.user.email);
    }),
  );

  return (
    <>
      <VoucherAdmin vouchers={list} />
      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-lg text-gold-light">ประวัติการใช้โค้ดล่าสุด (50 รายการ)</h2>
        {(redemptions.data ?? []).length === 0 ? (
          <p className="text-sm text-cream-muted">ยังไม่มีการใช้โค้ด</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(redemptions.data ?? []).map((r) => (
              <li key={r.id} className="rounded-2xl border border-gold/25 bg-velvet/70 p-3 text-xs text-cream-muted">
                <span className="text-cream">{formatThaiDateTime(r.created_at)}</span> · โค้ด <b className="font-tarot text-gold-light">{codeOf.get(r.voucher_id) ?? "?"}</b> · +{r.coins.toLocaleString("th-TH")} เหรียญ
                <br />
                <span className="break-all">{emails.get(r.user_id) ?? r.user_id}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
