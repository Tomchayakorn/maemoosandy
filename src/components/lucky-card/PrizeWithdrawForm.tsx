"use client";

import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";
import type { LuckyCardWithdrawResponse } from "@/lib/lucky-card/types";
import { THAI_BANKS } from "@/lib/withdrawals";

const field =
  "h-14 w-full rounded-xl border border-gold/30 bg-velvet/80 px-4 text-base text-cream placeholder:text-cream-muted/60 focus:border-gold focus:outline-none";

/**
 * Bank details + submit for withdrawing one "เทพประทานทรัพย์" prize.
 * Used on the result screen ("ถอนตอนนี้") and on /withdraw (saved "ถอนทีหลัง" prizes).
 * The amount is NOT sent: the server reads it from the stored prize.
 */
export function PrizeWithdrawForm({
  prizeId,
  amountThb,
  onDone,
  onCancel,
}: {
  prizeId: string;
  amountThb: number;
  onDone: (r: LuckyCardWithdrawResponse) => void;
  onCancel?: () => void;
}) {
  const [bankName, setBankName] = useState<string>(THAI_BANKS[0]);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return; // no double submit
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lucky-card/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prizeId, bankName, accountNumber, accountName }),
      });
      const json = (await res.json().catch(() => null)) as LuckyCardWithdrawResponse | { error?: { message?: string } } | null;
      if (!res.ok || !json || !("requestId" in json)) {
        setError((json && "error" in json && json.error?.message) || "ส่งคำขอไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      onDone(json);
    } catch {
      setError("เชื่อมต่อไม่ได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 text-left">
      <p className="text-center text-sm text-cream-muted">
        ถอน <b className="text-gold-light">{amountThb.toLocaleString("th-TH")} บาท</b> เข้าบัญชีธนาคารของคุณ
      </p>
      <select value={bankName} onChange={(e) => setBankName(e.target.value)} className={field} aria-label="ธนาคาร">
        {THAI_BANKS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <input
        value={accountNumber}
        onChange={(e) => setAccountNumber(e.target.value)}
        inputMode="numeric"
        placeholder="เลขที่บัญชี"
        aria-label="เลขที่บัญชี"
        className={field}
        required
      />
      <input
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
        placeholder="ชื่อ-นามสกุลเจ้าของบัญชี"
        aria-label="ชื่อเจ้าของบัญชี"
        className={field}
        required
      />
      {error && <p className="text-center text-sm text-rose-300">{error}</p>}
      <GoldButton type="submit" disabled={busy} className="w-full">
        {busy ? "กำลังส่งคำขอ..." : "ยืนยันขอถอน"}
      </GoldButton>
      {onCancel && (
        <GoldButton type="button" variant="outline" onClick={onCancel} disabled={busy} className="w-full">
          ย้อนกลับ
        </GoldButton>
      )}
    </form>
  );
}
