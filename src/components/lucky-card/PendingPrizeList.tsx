"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { PrizeWithdrawForm } from "./PrizeWithdrawForm";

export type PendingPrize = { id: string; amount_thb: number; created_at: string; label: string };

/** Saved "ถอนทีหลัง" prizes from ดวงดี มีเฮ, withdrawable from the jackpot-withdrawal menu. */
export function PendingPrizeList({ prizes }: { prizes: PendingPrize[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Record<string, string>>({});

  if (prizes.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-lg text-gold-light">สิทธิ์ถอนจาก “ดวงดี มีเฮ”</h2>
      {prizes.map((p) => (
        <MysticCard key={p.id} className="flex flex-col gap-3 border border-gold/60 p-4">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-cream">เทพประทานทรัพย์ · {p.label}</span>
            <b className="font-tarot text-lg text-gold-light">{p.amount_thb.toLocaleString("th-TH")} บาท</b>
          </div>
          {doneIds[p.id] ? (
            <p className="text-center text-sm text-gold-light">
              ส่งคำขอถอนแล้วค่ะ ✨ รอดำเนินการตรวจสอบ
              <span className="mt-1 block break-all font-tarot text-xs text-cream-muted">รหัสอ้างอิง: {doneIds[p.id]}</span>
            </p>
          ) : openId === p.id ? (
            <PrizeWithdrawForm
              prizeId={p.id}
              amountThb={p.amount_thb}
              onCancel={() => setOpenId(null)}
              onDone={(r) => {
                setDoneIds((d) => ({ ...d, [p.id]: r.requestId }));
                setOpenId(null);
                router.refresh();
              }}
            />
          ) : (
            <GoldButton onClick={() => setOpenId(p.id)} className="w-full">
              ถอนรางวัลนี้
            </GoldButton>
          )}
        </MysticCard>
      ))}
    </section>
  );
}
