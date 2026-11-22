"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { useSurpriseBlock } from "@/lib/cat-game/surprise-block";
import { confirmRules, hasConfirmedRules, rulesConsentKey, subscribeRulesConsent, type RulesGame } from "@/lib/rules-consent";

/**
 * "กติกาการเล่นและการถอนเงิน" pop-up. Until this player (this account, this browser) has confirmed the rules of THIS game it opens
 * and blocks play: scroll to the end, tick the checkbox, press confirm. The confirmation is remembered in localStorage per game + user
 * (src/lib/rules-consent.ts), so it does not pop up again. The "กติกา & การถอน" button re-opens the rules any time in review mode
 * (no checkbox, just close). Purely presentational: nothing here touches coins or the server.
 */
export function RulesGate({ game, userId, title, startLabel, children }: { game: RulesGame; userId: string; title: string; startLabel: string; children: ReactNode }) {
  const key = rulesConsentKey(game, userId);
  // server snapshot = "confirmed" so the server HTML never contains the pop-up; the client then shows it if storage says otherwise
  const confirmed = useSyncExternalStore(
    subscribeRulesConsent,
    () => hasConfirmedRules(key),
    () => true,
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const open = !confirmed || reviewOpen;
  useSurpriseBlock(open); // the cat-game surprise waits until the rules pop-up is closed
  const setOpen = (v: boolean) => setReviewOpen(v);
  const [readAll, setReadAll] = useState(false);
  const [checked, setChecked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight - el.scrollTop <= 12) setReadAll(true);
  }, []);

  // lock page scroll while open; check whether the rules already fit without scrolling
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    measure();
    window.addEventListener("resize", measure);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  // Escape closes only in review mode (the gate must be confirmed)
  useEffect(() => {
    if (!open || !confirmed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmed]);

  const gate = !confirmed;
  const canStart = readAll && checked;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-gold/50 px-4 text-xs text-gold-light transition hover:bg-gold/10"
      >
        <span aria-hidden>📜</span> กติกา &amp; การถอน
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-velvet/85 backdrop-blur-sm sm:items-center sm:px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/50 bg-midnight shadow-[0_0_40px_-8px_rgb(212_175_55/0.6)] sm:rounded-3xl"
          >
            <div className="border-b border-gold/20 px-5 pb-3 pt-4 text-center">
              <h2 id="rules-title" className="font-display text-2xl text-gold-gradient">
                {title}
              </h2>
              {gate && <p className="mt-1 text-xs text-cream-muted">กรุณาอ่านให้ครบก่อนเริ่มเล่น</p>}
            </div>

            <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                onScroll={measure}
                tabIndex={0}
                aria-label="เนื้อหากติกา เลื่อนเพื่ออ่านต่อ"
                className="h-full max-h-[52dvh] overflow-y-auto overscroll-contain px-5 py-4 text-left text-sm leading-relaxed text-cream"
              >
                {children}
              </div>
              {gate && !readAll && (
                <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-midnight via-midnight/90 to-transparent px-5 pb-1.5 pt-6 text-center text-xs text-gold-light">
                  ↓ เลื่อนลงเพื่ออ่านต่อ
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2.5 border-t border-gold/20 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              {gate ? (
                <>
                  <label className={"flex items-start gap-2.5 text-left text-sm " + (readAll ? "text-cream" : "text-cream-muted/60")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!readAll}
                      onChange={(e) => setChecked(e.target.checked)}
                      className="mt-0.5 size-5 shrink-0 accent-[#d4af37] disabled:opacity-50"
                    />
                    <span>ฉันได้อ่านและเข้าใจกติกาการเล่นและการถอนเงินแล้ว</span>
                  </label>
                  {!readAll && <p className="text-xs text-cream-muted">เลื่อนอ่านให้ถึงท้ายกติกาเพื่อปลดล็อกช่องติ๊ก</p>}
                  <GoldButton
                    disabled={!canStart}
                    onClick={() => {
                      confirmRules(key);
                      setOpen(false);
                    }}
                    className="w-full"
                  >
                    {startLabel}
                  </GoldButton>
                  <Link href="/" className={goldButtonClass({ variant: "ghost", className: "w-full" })}>
                    ยังไม่เล่น กลับหน้าแรก
                  </Link>
                </>
              ) : (
                <GoldButton onClick={() => setOpen(false)} className="w-full">
                  ปิด
                </GoldButton>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
