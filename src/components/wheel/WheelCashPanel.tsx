"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrizeWithdrawForm } from "@/components/lucky-card/PrizeWithdrawForm";
import { GoldButton } from "@/components/ui/GoldButton";
import { formatCoins } from "@/lib/pricing";
import {
  cashUiState,
  WHEEL_CASH_BIG,
  WHEEL_CASH_LIMITS,
  WHEEL_CASH_PCT,
  WHEEL_CASH_SMALL,
  type WheelCashTier,
} from "@/lib/wheel/cash";

/**
 * "ยอดสะสมจากการหมุนเกม": a withdrawal ticket kept apart from the main wallet. The server re-checks everything (wallet row lock,
 * one pending request, daily/weekly quota); this panel only shows the state and sends the tier + bank details.
 */
export function WheelCashPanel({
  total,
  pending,
  usage,
}: {
  total: number;
  pending: boolean;
  usage: { day: number; week: number };
}) {
  const router = useRouter();
  const [tier, setTier] = useState<WheelCashTier | null>(null);
  // optimistic "request sent": valid only while the server snapshot it was made against is unchanged
  const [sentAt, setSentAt] = useState<{ total: number; pending: boolean } | null>(null);
  const justSent = sentAt !== null && sentAt.total === total && sentAt.pending === pending;
  const isPending = pending || justSent;
  const ui = cashUiState(total, isPending, usage);

  // another tab/device may have changed the state: re-read it when the user comes back
  useEffect(() => {
    const sync = () => router.refresh();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [router]);

  const pct = (n: number) => Math.round(Math.min(1, Math.max(0, total / n)) * 100);

  return (
    <div data-testid="wheel-cash" className="flex w-full flex-col gap-3 rounded-2xl border border-gold/40 bg-velvet/70 p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-cream">ยอดสะสมจากการหมุนเกม</p>
          <p className="text-[11px] leading-snug text-cream-muted">แยกจากเหรียญในกระเป๋าหลัก · ใช้ถอนเป็นเงินเท่านั้น</p>
        </div>
        <b data-testid="wheel-cash-total" className="shrink-0 font-tarot text-xl tabular-nums text-gold-light">
          {formatCoins(total)}
        </b>
      </div>

      {/* two milestones: 500 (small) and 5,000 (big) */}
      <div className="flex flex-col gap-2 text-xs text-cream-muted">
        <div>
          <div className="mb-1 flex justify-between">
            <span>ขั้นถอนย่อย {formatCoins(WHEEL_CASH_SMALL)} = {formatCoins(WHEEL_CASH_SMALL)} บาท</span>
            <span className="text-gold-light">{ui.small.remaining > 0 ? `อีก ${formatCoins(ui.small.remaining)}` : "ถึงเป้าแล้ว ✓"}</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={WHEEL_CASH_SMALL} aria-valuenow={Math.min(total, WHEEL_CASH_SMALL)} aria-label="ยอดสะสมเทียบขั้นถอนย่อย 500" className="h-2.5 overflow-hidden rounded-full border border-gold/30 bg-midnight">
            <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-[width] duration-500" style={{ width: `${pct(WHEEL_CASH_SMALL)}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between">
            <span>ขั้นถอนใหญ่ {formatCoins(WHEEL_CASH_BIG)} = {formatCoins(WHEEL_CASH_BIG)} บาท</span>
            <span className="text-gold-light">{ui.big.remaining > 0 ? `อีก ${formatCoins(ui.big.remaining)}` : "ถึงเป้าแล้ว ✓"}</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={WHEEL_CASH_BIG} aria-valuenow={Math.min(total, WHEEL_CASH_BIG)} aria-label="ยอดสะสมเทียบขั้นถอนใหญ่ 5,000" className="h-1.5 overflow-hidden rounded-full border border-gold/20 bg-midnight">
            <div className="h-full rounded-full bg-gold/70 transition-[width] duration-500" style={{ width: `${pct(WHEEL_CASH_BIG)}%` }} />
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-cream-muted">
        นับ {WHEEL_CASH_PCT}% ของเหรียญรางวัลจากรอบที่จ่ายเหรียญ (ไม่นับรอบหมุนฟรีและแจ็กพอต) · ขั้นย่อยถอนได้วันละ {WHEEL_CASH_LIMITS.perDay} ครั้ง
        สัปดาห์ละ {WHEEL_CASH_LIMITS.perWeek} ครั้ง (เวลาไทย) · เมื่อกดถอน ระบบกันยอดสะสมไว้ทันที คืนให้ถ้าแอดมินปฏิเสธ
      </p>
      <p data-testid="wheel-cash-quota" className="text-[11px] text-cream-muted">
        โควตาขั้นย่อย: วันนี้เหลือ <b className="text-gold-light">{ui.dayLeft}</b>/{WHEEL_CASH_LIMITS.perDay} · สัปดาห์นี้เหลือ{" "}
        <b className="text-gold-light">{ui.weekLeft}</b>/{WHEEL_CASH_LIMITS.perWeek}
      </p>

      {ui.pending ? (
        <div role="status" className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-center text-sm text-gold-light">
          มีรายการขอถอนกำลังรอตรวจสอบ ✨ ขอถอนซ้ำไม่ได้จนกว่าแอดมินจะอนุมัติหรือปฏิเสธ
        </div>
      ) : tier ? (
        <PrizeWithdrawForm
          amountThb={tier}
          endpoint="/api/lucky-wheel/cash-withdraw"
          extraBody={{ tier }}
          onCancel={() => setTier(null)}
          onFailed={() => router.refresh()}
          onDone={() => {
            setTier(null);
            setSentAt({ total, pending });
            router.refresh();
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <GoldButton onClick={() => setTier(WHEEL_CASH_SMALL)} disabled={!ui.small.ready} className="w-full">
            ถอน {formatCoins(WHEEL_CASH_SMALL)} บาท
          </GoldButton>
          {ui.small.blocked === "day" && <p className="text-center text-xs text-gold-light">วันนี้ถอนขั้นย่อยครบโควตาแล้ว พรุ่งนี้ถอนได้ใหม่ค่ะ</p>}
          {ui.small.blocked === "week" && <p className="text-center text-xs text-gold-light">สัปดาห์นี้ถอนขั้นย่อยครบโควตาแล้ว เริ่มนับใหม่วันจันทร์ค่ะ</p>}
          {total >= WHEEL_CASH_BIG && (
            <GoldButton onClick={() => setTier(WHEEL_CASH_BIG)} disabled={!ui.big.ready} className="w-full">
              ถอน {formatCoins(WHEEL_CASH_BIG)} บาท (ขั้นใหญ่)
            </GoldButton>
          )}
        </div>
      )}
    </div>
  );
}
