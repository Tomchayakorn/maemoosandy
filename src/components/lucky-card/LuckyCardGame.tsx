"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { goldCelebration, goldSparkleAt } from "@/components/fx/confetti";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { getLuckyCardMessage, LUCKY_CARD_CATEGORY_LABEL } from "@/data/lucky-card-messages";
import { BONUS_TARGET, BONUS_WITHDRAW_THB, bonusProgress, bonusWithdrawState } from "@/lib/lucky-card/bonus";
import type { LuckyCardOutcome, LuckyCardPlayResponse } from "@/lib/lucky-card/types";
import { formatCoins } from "@/lib/pricing";
import { walletBus } from "@/lib/wallet-bus";
import { PrizeWithdrawForm } from "./PrizeWithdrawForm";

/**
 * "ดวงดี มีเฮ" — 1 round = 20 coins, flip 1 of 8 cards.
 * No game logic here: the server charges, draws and records everything (POST /api/lucky-card/play).
 * The client only animates and shows the balance optimistically (walletBus), like the wheel.
 */
export const LUCKY_CARD_COST = 20; // display + optimistic hold only; the server charges from its own constant
export const LUCKY_CARD_COUNT = 8;
const LUCKY_CARD_PITY_ROUNDS = 50; // display only; the server/database apply the real guarantee (lucky-card-config.ts PITY_AFTER_DRY_ROUNDS)
const CARD_BACK_SRC = "/images/card-back-mandala.jpg";

type Phase =
  | { name: "pick" }
  | { name: "loading"; index: number }
  | { name: "result"; index: number; outcome: LuckyCardOutcome };

export function LuckyCardGame({
  initialBalance,
  initialBonusTotal = 0,
  initialBonusPending = false,
}: {
  initialBalance: number;
  /** Accumulated bonus coins from this game (separate from the main wallet). */
  initialBonusTotal?: number;
  /** A bonus cash-out request is already waiting for the admin. */
  initialBonusPending?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>({ name: "pick" });
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | null>(null);
  const [bonusTotal, setBonusTotal] = useState(initialBonusTotal);
  const [bonusPending, setBonusPending] = useState(initialBonusPending);
  const balanceRef = useRef(balance);
  const busy = useRef(false);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // follow fresh server values after router.refresh(), but never mid-round
  useEffect(() => {
    if (!busy.current) setBalance(initialBalance);
  }, [initialBalance]);
  useEffect(() => {
    if (!busy.current) {
      setBonusTotal(initialBonusTotal);
      setBonusPending(initialBonusPending);
    }
  }, [initialBonusTotal, initialBonusPending]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => () => walletBus.release(balanceRef.current), []);

  const notEnough = balance < LUCKY_CARD_COST;

  async function pick(index: number) {
    if (busy.current || notEnough || phase.name !== "pick") return;
    busy.current = true;
    setError(null);
    const before = balance;
    setPhase({ name: "loading", index }); // card flips instantly
    setBalance(before - LUCKY_CARD_COST);
    walletBus.hold(before - LUCKY_CARD_COST);
    const rollback = (msg: string) => {
      setBalance(before);
      walletBus.release(before);
      setPhase({ name: "pick" });
      setError(msg);
      busy.current = false;
      router.refresh();
    };
    try {
      const res = await fetch("/api/lucky-card/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIndex: index }),
      });
      const json = (await res.json().catch(() => null)) as LuckyCardPlayResponse | { error?: { message?: string } } | null;
      if (!res.ok || !json || !("outcome" in json)) {
        return rollback((json && "error" in json && json.error?.message) || "เปิดไพ่ไม่สำเร็จ ลองใหม่อีกครั้งนะคะ (ยังไม่มีการหักเหรียญซ้ำ)");
      }
      setBalance(json.balance);
      if (json.bonusTotal !== null) setBonusTotal(json.bonusTotal);
      else {
        const won = json.outcome.kind === "bonus" ? json.outcome.coins : 0;
        if (won) setBonusTotal((t) => t + won);
      }
      walletBus.release(json.balance);
      setPhase({ name: "result", index, outcome: json.outcome });
      busy.current = false;
      celebrate(json.outcome, cardRefs.current[index]);
      router.refresh();
    } catch {
      rollback("เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ");
    }
  }

  function again() {
    setPhase({ name: "pick" });
  }

  return (
    <section className="flex flex-col gap-5 text-center">
      <p className="text-sm text-cream-muted">
        เปิดไพ่ 1 ใบจาก {LUCKY_CARD_COUNT} ใบ · รอบละ <b className="text-gold-light">{LUCKY_CARD_COST}</b> เหรียญ · คงเหลือ{" "}
        <b className="text-gold-light">{formatCoins(balance)}</b> เหรียญ
        <br />
        <span className="text-xs text-cream-muted/80">ไม่ได้โบนัสติดต่อกัน {LUCKY_CARD_PITY_ROUNDS} รอบ รอบถัดไปการันตีโบนัส 100 เหรียญ</span>
      </p>

      {phase.name !== "result" && (
        <div className="grid grid-cols-4 gap-2.5 [perspective:900px]">
          {Array.from({ length: LUCKY_CARD_COUNT }, (_, i) => {
            const flipped = phase.name === "loading" && phase.index === i;
            return (
              <motion.button
                key={i}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                type="button"
                disabled={notEnough || phase.name === "loading"}
                onClick={() => pick(i)}
                aria-label={`เปิดไพ่ใบที่ ${i + 1}`}
                animate={reduce ? undefined : { rotateY: flipped ? 180 : 0 }}
                whileTap={reduce ? undefined : { scale: 0.93 }}
                transition={{ duration: 0.25 }}
                // card follows the artwork's own ratio (1536×2752) so `cover` shows the whole frame, uncropped
                className="preserve-3d relative aspect-[1536/2752] rounded-xl shadow-[0_0_14px_-6px_rgb(212_175_55/0.7)] disabled:opacity-50"
              >
                {/* back (mandala artwork) */}
                <span className="backface-hidden absolute inset-0 overflow-hidden rounded-xl border border-gold/50 bg-velvet">
                  <Image
                    src={CARD_BACK_SRC}
                    alt=""
                    fill
                    sizes="(max-width: 448px) 22vw, 100px"
                    quality={75}
                    draggable={false}
                    className="object-cover object-center"
                  />
                  {flipped && reduce && (
                    <span className="absolute inset-0 flex animate-pulse items-center justify-center bg-velvet/50 font-tarot text-2xl text-gold">✦</span>
                  )}
                </span>
                {/* face shown while the server draws (revealed by the flip) */}
                <span className="backface-hidden absolute inset-0 flex items-center justify-center rounded-xl border border-gold bg-gradient-to-b from-midnight to-velvet font-tarot text-2xl text-gold [transform:rotateY(180deg)]">
                  <span className="animate-pulse">✦</span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      <BonusMeter total={bonusTotal} pending={bonusPending} onRequested={() => setBonusPending(true)} />

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {notEnough && phase.name === "pick" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-velvet/70 p-4">
          <p className="text-sm text-gold-light">เหรียญไม่พอ (ต้องใช้ {LUCKY_CARD_COST} เหรียญ ต่อรอบ)</p>
          <Link href="/topup" className={goldButtonClass({ className: "w-full" })}>
            เติมเหรียญเลย
          </Link>
        </div>
      )}

      <AnimatePresence>
        {phase.name === "result" && (
          <ResultView key="result" outcome={phase.outcome} reduce={!!reduce} balance={balance} onAgain={again} />
        )}
      </AnimatePresence>
    </section>
  );
}

/** Level-by-level celebration. Message = none; bonus 100/300/500 = 1/2/3; secret = max. */
function celebrate(outcome: LuckyCardOutcome, card: HTMLElement | null) {
  if (outcome.kind === "message") return;
  if (outcome.kind === "bonus") {
    if (outcome.coins === 100) goldSparkleAt(card);
    else if (outcome.coins === 300) {
      goldSparkleAt(card);
      setTimeout(goldCelebration, 150);
    } else {
      goldCelebration();
      setTimeout(goldCelebration, 500);
      setTimeout(goldCelebration, 1000);
    }
    return;
  }
  for (let i = 0; i < 5; i++) setTimeout(goldCelebration, i * 600);
}

function ResultView({
  outcome,
  reduce,
  balance,
  onAgain,
}: {
  outcome: LuckyCardOutcome;
  reduce: boolean;
  balance: number;
  onAgain: () => void;
}) {
  const [step, setStep] = useState<"choose" | "form" | "later" | "done">("choose");
  const [requestId, setRequestId] = useState<string | null>(null);
  const message = outcome.kind === "message" ? getLuckyCardMessage(outcome.messageId) : undefined;
  const canAgain = balance >= LUCKY_CARD_COST;

  const pop = reduce ? {} : { initial: { opacity: 0, scale: 0.8, y: 20 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { type: "spring" as const, stiffness: 260, damping: 18 } };

  const bonusTier = outcome.kind === "bonus" ? (outcome.coins === 100 ? 1 : outcome.coins === 300 ? 2 : 3) : 0;

  return (
    <motion.div
      {...pop}
      exit={{ opacity: 0 }}
      className={
        "relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border p-6 " +
        (outcome.kind === "secret"
          ? "border-gold bg-[radial-gradient(circle_at_50%_0%,rgb(212_175_55/0.35),rgb(11_10_18/0.95)_70%)] shadow-[0_0_60px_-6px_rgb(243_217_139/0.9)]"
          : bonusTier > 0
            ? "border-gold/70 bg-velvet/80 shadow-[0_0_34px_-8px_rgb(212_175_55/0.8)]"
            : "border-gold/40 bg-velvet/70")
      }
    >
      {/* rotating halo for tier 2+ and the secret prize */}
      {!reduce && (bonusTier >= 2 || outcome.kind === "secret") && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[conic-gradient(from_0deg,transparent,rgb(243_217_139/0.35),transparent_30%,rgb(212_175_55/0.3),transparent_60%)]"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: outcome.kind === "secret" ? 6 : 9, ease: "linear" }}
        />
      )}

      {outcome.kind === "message" && message && (
        <>
          <p className="text-xs tracking-widest text-gold/80">{LUCKY_CARD_CATEGORY_LABEL[message.category]}</p>
          <p className="font-serif text-lg leading-relaxed text-cream">{message.text}</p>
        </>
      )}

      {outcome.kind === "bonus" && (
        <>
          <p className="relative text-xs tracking-widest text-gold/80">
            {outcome.guaranteed ? "โบนัสการันตี ✨" : `โบนัสพิเศษ ระดับ ${bonusTier}`}
          </p>
          <motion.p
            className={"relative font-tarot font-bold text-gold-gradient " + (bonusTier === 3 ? "text-6xl" : bonusTier === 2 ? "text-5xl" : "text-4xl")}
            animate={reduce ? undefined : { scale: bonusTier === 3 ? [1, 1.25, 1, 1.15, 1] : [1, 1.15, 1] }}
            transition={{ duration: bonusTier === 3 ? 1.4 : 0.7 }}
          >
            +{formatCoins(outcome.coins)}
          </motion.p>
          <p className="relative text-sm text-cream">เหรียญ เข้ากระเป๋าของคุณแล้ว</p>
        </>
      )}

      {outcome.kind === "secret" && (
        <>
          <p className="relative text-xs tracking-widest text-gold-light">✦ รางวัลลับ ✦</p>
          <motion.p
            className="relative font-display text-4xl text-gold-gradient"
            animate={reduce ? undefined : { scale: [1, 1.12, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            เทพประทานทรัพย์
          </motion.p>
          <p className="relative font-tarot text-3xl text-gold-light">{outcome.amountThb.toLocaleString("th-TH")} บาท</p>

          {step === "choose" && (
            <div className="relative flex w-full flex-col gap-2">
              <p className="text-sm text-cream">ขอแสดงความยินดี! จะถอนตอนนี้ หรือเก็บสิทธิ์ไว้ถอนทีหลัง?</p>
              <GoldButton onClick={() => setStep("form")} className="w-full">
                ถอนตอนนี้
              </GoldButton>
              <GoldButton variant="outline" onClick={() => setStep("later")} className="w-full">
                ถอนทีหลัง
              </GoldButton>
            </div>
          )}
          {step === "form" && (
            <div className="relative w-full">
              <PrizeWithdrawForm
                prizeId={outcome.prizeId}
                amountThb={outcome.amountThb}
                onDone={(r) => {
                  setRequestId(r.requestId);
                  setStep("done");
                }}
                onCancel={() => setStep("choose")}
              />
            </div>
          )}
          {step === "later" && (
            <div className="relative flex flex-col items-center gap-2 text-sm text-cream">
              <p>เก็บสิทธิ์ไว้ให้แล้วค่ะ ✨ กดถอนได้ทุกเมื่อที่เมนู “ถอนรางวัลแจ็กพอต”</p>
              <Link href="/withdraw" className={goldButtonClass({ variant: "outline", className: "w-full" })}>
                ไปหน้าถอนรางวัล
              </Link>
            </div>
          )}
          {step === "done" && (
            <div className="relative flex flex-col items-center gap-1 text-sm text-gold-light">
              <p>ส่งคำขอถอนเรียบร้อยแล้วค่ะ ✨ สถานะ: รอดำเนินการตรวจสอบ</p>
              <p className="break-all font-tarot text-xs text-cream-muted">รหัสอ้างอิง: {requestId}</p>
            </div>
          )}
        </>
      )}

      {canAgain ? (
        <GoldButton variant="outline" onClick={onAgain} className="relative w-full">
          เปิดไพ่อีกรอบ ({LUCKY_CARD_COST} เหรียญ)
        </GoldButton>
      ) : (
        <Link href="/topup" className={goldButtonClass({ className: "relative w-full" })}>
          เหรียญไม่พอ เติมเหรียญเลย
        </Link>
      )}
    </motion.div>
  );
}

/** Progress towards the 1,000-coin cash-out + the withdraw button. The server re-checks everything. */
function BonusMeter({ total, pending, onRequested }: { total: number; pending: boolean; onRequested: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const state = bonusWithdrawState(total, pending);
  const pct = Math.round(bonusProgress(total) * 100);

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-gold/30 bg-velvet/70 p-4 text-left">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-cream">โบนัสสะสมจากเกมนี้</span>
        <b className="font-tarot text-gold-light">
          {formatCoins(total)} / {formatCoins(BONUS_TARGET)} เหรียญ
        </b>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={BONUS_TARGET}
        aria-valuenow={Math.min(total, BONUS_TARGET)}
        aria-label="โบนัสสะสมเทียบเป้า 1,000 เหรียญ"
        className="h-3 overflow-hidden rounded-full border border-gold/30 bg-midnight"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-cream-muted">
        ครบ {formatCoins(BONUS_TARGET)} เหรียญ ถอนเป็นเงิน {formatCoins(BONUS_WITHDRAW_THB)} บาท · เหรียญโบนัสยังเข้ากระเป๋าหลักตามปกติ
        การถอนจะหักเฉพาะยอดสะสมนี้ ไม่กระทบเหรียญในกระเป๋า
      </p>

      {state.kind === "pending" && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-center text-sm text-gold-light">
          ส่งคำขอถอนแล้ว รอแอดมินตรวจสอบและโอนเงินค่ะ ✨
        </div>
      )}
      {state.kind === "locked" && (
        <GoldButton variant="outline" disabled className="w-full">
          สะสมอีก {formatCoins(state.remaining)} เหรียญ จึงถอนได้
        </GoldButton>
      )}
      {state.kind === "ready" &&
        (open ? (
          <PrizeWithdrawForm
            amountThb={BONUS_WITHDRAW_THB}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              onRequested();
              router.refresh();
            }}
          />
        ) : (
          <GoldButton onClick={() => setOpen(true)} className="w-full">
            ถอน {formatCoins(BONUS_WITHDRAW_THB)} บาท
          </GoldButton>
        ))}
    </div>
  );
}
