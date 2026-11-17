"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { THAI_BANKS, WITHDRAW_COINS, WITHDRAW_THB } from "@/lib/withdrawals";

const field =
  "h-14 w-full rounded-xl border border-gold/30 bg-velvet/80 px-4 text-base text-cream placeholder:text-cream-muted/60 focus:border-gold focus:outline-none";

export function WithdrawForm({ balance }: { balance: number }) {
  const router = useRouter();
  const [bankName, setBankName] = useState<string>(THAI_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const enough = balance >= WITHDRAW_COINS;
  const remaining = balance - WITHDRAW_COINS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/withdrawals/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankName, accountNumber, accountName }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(j?.error?.message ?? "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      const j = (await res.json().catch(() => null)) as { requestId?: string } | null;
      setDoneId(j?.requestId ?? "-");
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  if (doneId) {
    const oa = process.env.NEXT_PUBLIC_LINE_OA_URL;
    return (
      <MysticCard className="flex flex-col gap-3 p-5 text-center text-sm text-gold-light">
        <p>ส่งคำขอถอนเรียบร้อยแล้วค่ะ ✨ สถานะ: รอดำเนินการตรวจสอบ</p>
        <p className="break-all font-tarot text-xs text-cream-muted">รหัสอ้างอิง: {doneId}</p>
        <p className="text-xs text-cream-muted">ดูสถานะได้ในประวัติด้านล่าง</p>
        {oa && (
          <a
            href={oa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center rounded-full bg-[#06C755] px-5 font-semibold text-white"
          >
            แจ้งแอดมินผ่าน LINE OA ทันที
          </a>
        )}
      </MysticCard>
    );
  }

  return (
    <MysticCard className="border-2 border-gold p-5 shadow-[0_0_36px_-8px_rgb(212_175_55/0.7)]">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="rounded-2xl border border-gold/30 bg-gold/5 px-4 py-3 text-center">
          <p className="text-sm text-cream-muted">จำนวนที่ถอน (คงที่)</p>
          <p className="font-tarot text-2xl text-gold-light">
            {WITHDRAW_COINS.toLocaleString("th-TH")} เหรียญ = {WITHDRAW_THB.toLocaleString("th-TH")} บาท
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-cream-muted">
            <div><p>ยอดปัจจุบัน</p><p className="font-tarot text-base text-cream">{balance.toLocaleString("th-TH")}</p></div>
            <div><p>หัก</p><p className="font-tarot text-base text-rose-300">-{WITHDRAW_COINS.toLocaleString("th-TH")}</p></div>
            <div><p>คงเหลือหลังถอน</p><p className="font-tarot text-base text-gold-light">{enough ? remaining.toLocaleString("th-TH") : "—"}</p></div>
          </div>
        </div>

        {!enough && (
          <p role="alert" className="text-center text-sm text-rose-300">
            ยอดเหรียญคงเหลือไม่ถึง 5,000 เหรียญ ไม่สามารถทำรายการถอนได้
          </p>
        )}

        <label className="flex flex-col gap-1.5 text-sm text-cream">
          ธนาคาร
          <select value={bankName} onChange={(e) => setBankName(e.target.value)} className={field}>
            {THAI_BANKS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-cream">
          เลขที่บัญชี
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="เฉพาะตัวเลข"
            required
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-cream">
          ชื่อ-นามสกุลเจ้าของบัญชี
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            autoComplete="off"
            maxLength={120}
            required
            className={field}
          />
        </label>

        {error && <p role="alert" className="text-center text-sm text-rose-300">{error}</p>}

        <GoldButton type="submit" size="lg" disabled={busy || !enough}>
          {busy ? "กำลังส่งคำขอ..." : "ยืนยันขอถอนเงิน 5,000 บาท"}
        </GoldButton>
        <p className="text-center text-xs text-cream-muted">เหรียญ 5,000 จะถูกหักทันที หากคำขอถูกปฏิเสธ ระบบจะคืนเหรียญและสิทธิ์ให้</p>
      </form>
    </MysticCard>
  );
}
