import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReviewButtons } from "./review-buttons";
import { formatThaiDateTime } from "@/components/topup/topup-labels";
import { isAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { listLocalRequests, shouldUseLocalWithdrawals } from "@/lib/withdrawals-local";
import { WITHDRAW_STATUS_LABEL } from "@/lib/withdrawals";

export const metadata: Metadata = { title: "จัดการคำขอถอน", robots: { index: false, follow: false } };

export default function AdminWithdrawalsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pb-14 pt-8">
      <h1 className="font-display text-3xl text-gold-gradient">คำขอถอนรางวัลแจ็กพอต</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-gold/5" />}>
        <Data />
      </Suspense>
    </main>
  );
}

async function Data() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/withdrawals");
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("withdrawal_requests")
    .select("id, user_id, amount_thb, bank_name, account_number, account_name, status, created_at, reviewed_by, reviewed_at")
    .order("status", { ascending: false }) // 'pending' sorts after 'approved'/'rejected' desc → first
    .order("created_at", { ascending: true })
    .limit(100);
  const local = await shouldUseLocalWithdrawals(admin);
  const list = local ? await listLocalRequests() : (rows ?? []);

  // Evidence for the reviewer: the user's jackpot spin(s) and current wallet.
  const userIds = [...new Set(list.map((r) => r.user_id))];
  const [spins, wallets] = userIds.length
    ? await Promise.all([
        admin
          .from("spin_logs")
          .select("id, user_id, paid_spin_number, created_at")
          .in("user_id", userIds)
          .eq("reward_key", "jackpot_5000")
          .order("created_at", { ascending: false }),
        admin.from("wallets").select("user_id, balance, jackpot_withdrawals_available").in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  const wData = (wallets.data ?? []) as { user_id: string; balance: number; jackpot_withdrawals_available?: number }[];

  if (list.length === 0) return <p className="text-cream-muted">ยังไม่มีคำขอถอน</p>;

  return (
    <ul className="flex flex-col gap-3">
      {list.map((r) => {
        const jackpots = (spins.data ?? []).filter((s) => s.user_id === r.user_id);
        const w = wData.find((x) => x.user_id === r.user_id);
        return (
          <li key={r.id} className="rounded-2xl border border-gold/25 bg-velvet/70 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-lg text-gold-light">{r.amount_thb.toLocaleString("th-TH")} บาท</b>
              <span className="text-cream">{WITHDRAW_STATUS_LABEL[r.status]}</span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-cream-muted">
              <dt>ธนาคาร</dt><dd className="text-cream">{r.bank_name}</dd>
              <dt>เลขที่บัญชี</dt><dd className="select-all font-mono text-cream">{r.account_number}</dd>
              <dt>ชื่อบัญชี</dt><dd className="text-cream">{r.account_name}</dd>
              <dt>ผู้ใช้</dt><dd className="break-all font-mono text-xs">{r.user_id}</dd>
              <dt>ส่งคำขอ</dt><dd>{formatThaiDateTime(r.created_at)}</dd>
              <dt>บันทึกแจ็กพอต</dt>
              <dd>
                {jackpots.length === 0
                  ? <span className="text-rose-300">ไม่พบบันทึกถูกแจ็กพอตของผู้ใช้นี้!</span>
                  : jackpots.map((s) => `สปินที่ ${s.paid_spin_number ?? "-"} (${formatThaiDateTime(s.created_at)})`).join(" · ")}
              </dd>
              <dt>กระเป๋าตอนนี้</dt>
              <dd>{w ? `${w.balance.toLocaleString("th-TH")} เหรียญ · สิทธิ์ถอนคงเหลือ ${w.jackpot_withdrawals_available ?? (local ? "(ไฟล์ทดสอบ)" : 0)}` : "-"}</dd>
              {r.reviewed_at && (<><dt>ตรวจโดย</dt><dd>{r.reviewed_by} · {formatThaiDateTime(r.reviewed_at)}</dd></>)}
            </dl>
            {r.status === "pending" && <ReviewButtons id={r.id} />}
          </li>
        );
      })}
    </ul>
  );
}
