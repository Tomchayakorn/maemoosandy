"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";

export function ReviewButtons({ id, source = "jackpot", amountThb = 5000 }: { id: string; source?: "jackpot" | "lucky_card" | "lucky_card_bonus"; amountThb?: number }) {
  const baht = amountThb.toLocaleString("th-TH");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    const bonus = source === "lucky_card_bonus";
    const msg =
      action === "approve"
        ? bonus
          ? `ยืนยัน: โอนเงิน ${baht} บาทแล้ว และหักยอดโบนัสสะสมเกม 1,000 เหรียญ (ไม่กระทบกระเป๋าหลัก)?`
          : `ยืนยัน: โอนเงิน ${baht} บาทแล้ว และอนุมัติคำขอนี้?`
        : bonus ? "ยืนยัน: ยกเลิกคำขอนี้? (ยอดโบนัสสะสมไม่ถูกหัก ผู้ใช้ขอถอนใหม่ได้)" : source === "lucky_card" ? `ยืนยัน: ปฏิเสธและคืนสิทธิ์รางวัล ${baht} บาท ให้ผู้ใช้ถอนใหม่ได้?` : "ยืนยัน: ปฏิเสธและคืน 5,000 เหรียญ + สิทธิ์ถอน 1 ครั้งให้ผู้ใช้?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(j?.error?.message ?? "ไม่สำเร็จ");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <GoldButton onClick={() => act("approve")} disabled={busy}>อนุมัติ / โอนเงินแล้ว</GoldButton>
        <GoldButton variant="outline" onClick={() => act("reject")} disabled={busy}>{source === "lucky_card_bonus" ? "ยกเลิกคำขอ (ไม่หักยอดสะสม)" : source === "lucky_card" ? "ปฏิเสธและคืนสิทธิ์รางวัล" : "ปฏิเสธและคืนเหรียญ (5,000 เหรียญ + 1 สิทธิ์)"}</GoldButton>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
