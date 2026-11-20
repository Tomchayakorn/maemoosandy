"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GoldButton } from "@/components/ui/GoldButton";
import { BONUS_TARGET, BONUS_WITHDRAW_THB, bonusWithdrawState } from "@/lib/lucky-card/bonus";
import { formatCoins } from "@/lib/pricing";
import { PrizeWithdrawForm } from "./PrizeWithdrawForm";

/**
 * Withdraw action for the accumulated "ดวงดี มีเฮ" bonus (1,000 coins -> 1,000 THB), shared by /lucky-card and /withdraw.
 * States come from the SERVER (`total`, `pending`) and are re-synced when the tab regains focus, so a second tab/device
 * shows "waiting for review" and locks the button. The server re-checks everything (row lock + one pending request).
 *  - allowDefer: show "เก็บไว้ก่อน / ถอนทีหลัง" next to the withdraw button (the counter itself is untouched).
 */
export function BonusWithdrawAction({
  total,
  pending,
  allowDefer = false,
  onRequested,
}: {
  total: number;
  pending: boolean;
  allowDefer?: boolean;
  onRequested?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState(false);
  // Optimistic "request sent" flag: remember the server snapshot it was made against. It is only valid while the props are
  // unchanged, so as soon as the refreshed server state arrives (pending=true, or reviewed) it stops applying by itself.
  const [sentAt, setSentAt] = useState<{ total: number; pending: boolean } | null>(null);
  const justRequested = sentAt !== null && sentAt.total === total && sentAt.pending === pending;
  const isPending = pending || justRequested;
  const state = bonusWithdrawState(total, isPending);

  // cross-tab / cross-device sync: re-read the real status whenever the user comes back to this tab
  useEffect(() => {
    if (state.kind === "locked") return;
    const sync = () => router.refresh();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [state.kind, router]);

  function requested() {
    setOpen(false);
    setSentAt({ total, pending });
    onRequested?.();
    router.refresh();
  }

  if (state.kind === "pending") {
    return (
      <div className="flex flex-col gap-2">
        <div role="status" className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-center text-sm text-gold-light">
          มีรายการขอถอนกำลังรอตรวจสอบ ✨ แอดมินจะโอน {formatCoins(BONUS_WITHDRAW_THB)} บาทให้หลังตรวจสอบ
        </div>
        <GoldButton variant="outline" disabled className="w-full">
          รออนุมัติ ขอถอนซ้ำไม่ได้
        </GoldButton>
      </div>
    );
  }

  if (state.kind === "locked") {
    return (
      <GoldButton variant="outline" disabled className="w-full">
        สะสมอีก {formatCoins(state.remaining)} เหรียญ จึงถอนได้
      </GoldButton>
    );
  }

  // ready
  if (open) {
    return (
      <PrizeWithdrawForm
        amountThb={BONUS_WITHDRAW_THB}
        onCancel={() => setOpen(false)}
        onDone={requested}
        onFailed={() => router.refresh()} // e.g. another tab already took the coins: show the real state
      />
    );
  }
  if (deferred) {
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-xl border border-gold/20 bg-velvet/60 px-3 py-2 text-center text-sm text-cream-muted">
          เก็บสิทธิ์ไว้ให้แล้วค่ะ ยอดสะสม {formatCoins(total)} เหรียญยังอยู่ครบ กดถอนได้ทุกเมื่อ
        </p>
        <GoldButton onClick={() => { setDeferred(false); setOpen(true); }} className="w-full">
          เปิดถอน {formatCoins(BONUS_WITHDRAW_THB)} บาท
        </GoldButton>
        <Link href="/withdraw" className="text-center text-xs text-gold-light underline underline-offset-4">
          ดูสิทธิ์ที่หน้า “ถอนรางวัลแจ็กพอต”
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm text-gold-light">
        ยอดสะสมครบ {formatCoins(BONUS_TARGET)} เหรียญแล้ว! ถอนเป็นเงิน {formatCoins(BONUS_WITHDRAW_THB)} บาทได้เลย
      </p>
      <GoldButton onClick={() => setOpen(true)} className="w-full">
        ถอน {formatCoins(BONUS_WITHDRAW_THB)} บาท
      </GoldButton>
      {allowDefer && (
        <GoldButton variant="outline" onClick={() => setDeferred(true)} className="w-full">
          เก็บไว้ก่อน / ถอนทีหลัง
        </GoldButton>
      )}
    </div>
  );
}
