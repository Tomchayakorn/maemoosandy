"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";

export function ReviewButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    const msg =
      action === "approve"
        ? "ยืนยัน: โอนเงิน 5,000 บาทแล้ว และอนุมัติคำขอนี้?"
        : "ยืนยัน: ปฏิเสธและคืน 5,000 เหรียญ + สิทธิ์ถอน 1 ครั้งให้ผู้ใช้?";
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
        <GoldButton variant="outline" onClick={() => act("reject")} disabled={busy}>ปฏิเสธและคืนเหรียญ (5,000 เหรียญ + 1 สิทธิ์)</GoldButton>
      </div>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
