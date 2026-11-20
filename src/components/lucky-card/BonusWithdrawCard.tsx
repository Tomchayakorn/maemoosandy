"use client";

import Link from "next/link";
import { MysticCard } from "@/components/ui/MysticCard";
import { BONUS_TARGET, BONUS_WITHDRAW_THB } from "@/lib/lucky-card/bonus";
import { formatCoins } from "@/lib/pricing";
import { BonusWithdrawAction } from "./BonusWithdrawAction";

/**
 * Evidence card on /withdraw: the player's accumulated "ดวงดี มีเฮ" bonus is at/above 1,000 coins (or a request is already
 * waiting), shown with its status and the withdraw button, so a deferred ("ถอนทีหลัง") right is never lost.
 */
export function BonusWithdrawCard({ total, pending }: { total: number; pending: boolean }) {
  return (
    <MysticCard className="flex flex-col gap-3 border border-gold/60 p-4 shadow-[0_0_28px_-10px_rgb(212_175_55/0.7)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs tracking-widest text-gold/80">โบนัสสะสมจากเกม ดวงดี มีเฮ</p>
          <p className="font-serif text-base text-cream">สิทธิ์ถอน {formatCoins(BONUS_WITHDRAW_THB)} บาท</p>
        </div>
        <span
          className={
            "shrink-0 rounded-full border px-2.5 py-1 text-xs " +
            (pending ? "border-gold/40 text-gold-light" : "border-emerald-400/50 text-emerald-300")
          }
        >
          {pending ? "รอตรวจสอบ" : "พร้อมถอน"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-center text-xs text-cream-muted">
        <div className="rounded-xl border border-gold/20 bg-velvet/60 px-2 py-2">
          <dt>ยอดสะสมคงเหลือ</dt>
          <dd className="font-tarot text-base text-cream">{formatCoins(total)} เหรียญ</dd>
        </div>
        <div className="rounded-xl border border-gold/20 bg-velvet/60 px-2 py-2">
          <dt>เป้าถอน</dt>
          <dd className="font-tarot text-base text-cream">{formatCoins(BONUS_TARGET)} เหรียญ</dd>
        </div>
      </dl>
      <BonusWithdrawAction total={total} pending={pending} />
      <Link href="/lucky-card" className="text-center text-xs text-gold-light underline underline-offset-4">
        กลับไปเล่น ดวงดี มีเฮ
      </Link>
    </MysticCard>
  );
}
