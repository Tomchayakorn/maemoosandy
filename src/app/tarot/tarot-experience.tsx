"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CardBack, CardFace } from "@/components/tarot/CardArt";
import { FlipCard } from "@/components/tarot/FlipCard";
import { CrystalBallLoader } from "@/components/fx/CrystalBallLoader";
import { goldCelebration, goldSparkleAt } from "@/components/fx/confetti";
import { ReadAloudControl } from "@/components/fortune/ReadAloudControl";
import { ReadingCard } from "@/components/fortune/ReadingCard";
import { unlockSpeech } from "@/lib/tts/speech";
import { ShareButton } from "@/components/fortune/ShareButton";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { CoinIcon } from "@/components/ui/icons";
import { FORTUNE_PRICES, formatCoins } from "@/lib/pricing";
import { POSITIONS, shortThaiName, type TarotResponse } from "@/lib/tarot/deck";

type Phase = "ask" | "pick" | "loading" | "reveal" | "result" | "error";
type ApiError = { code: string; message: string };

const PRICE = FORTUNE_PRICES.tarot;
const SPREAD_SIZE = 21;
const PICK_COUNT = 3;
const MIN_LOADING_MS = 3200;
const MAX_QUESTION = 300;

const TAROT_MESSAGES = [
  "แม่มูแซนดี้กำลังสื่อจิตเปิดดวงชะตา...",
  "ไพ่กำลังกระซิบความลับของหนู...",
  "กำลังถอดรหัสจากบ้าน ณ มัณตรา...",
  "อดีต ปัจจุบัน อนาคต กำลังเรียงร้อยเป็นคำตอบ...",
];

// Deterministic tilt per card in the spread (no hydration mismatch).
const TILTS = Array.from({ length: SPREAD_SIZE }, (_, i) => (((i * 37) % 11) - 5) * 0.9);

export function TarotExperience({
  initialBalance,
  initialFreeTickets,
}: {
  initialBalance: number;
  initialFreeTickets: number;
}) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [useFree, setUseFree] = useState(initialFreeTickets > 0);
  const [balance, setBalance] = useState(initialBalance);
  const [freeTickets, setFreeTickets] = useState(initialFreeTickets);
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<TarotResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [flipped, setFlipped] = useState(0);
  const [typingDone, setTypingDone] = useState(false);

  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shareRef = useRef<HTMLDivElement>(null);

  const payingWithTicket = useFree && freeTickets > 0;
  const canAfford = payingWithTicket || balance >= PRICE;
  const trimmed = question.trim();

  // ---- ask → pick
  function startPicking() {
    if (trimmed.length < 3 || !canAfford) return;
    setPicked([]);
    setPhase("pick");
  }

  // ---- call the API once three cards are chosen
  const requestReading = useCallback(async () => {
    setPhase("loading");
    const started = performance.now();
    let body: TarotResponse | { error: ApiError } | null = null;
    let ok = false;
    try {
      const res = await fetch("/api/fortune/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, useFreeTicket: payingWithTicket }),
      });
      ok = res.ok;
      body = await res.json().catch(() => null);
    } catch {
      body = null;
    }

    const wait = MIN_LOADING_MS - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    if (ok && body && "cards" in body) {
      setResult(body);
      setBalance(body.balance);
      setFreeTickets(body.freeReadingTickets);
      setFlipped(0);
      setTypingDone(false);
      setPhase("reveal");
    } else {
      setError(
        body && "error" in body
          ? body.error
          : { code: "NETWORK", message: "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ค่ะ" },
      );
      setPhase("error");
    }
  }, [trimmed, payingWithTicket]);

  function pickCard(index: number) {
    if (phase !== "pick" || picked.includes(index) || picked.length >= PICK_COUNT) return;
    const next = [...picked, index];
    setPicked(next);
    if (next.length === PICK_COUNT) {
      // This tap is the last user gesture before the reading arrives; mobile browsers need it to allow speech.
      unlockSpeech();
      setTimeout(requestReading, 700);
    }
  }

  // ---- reveal: flip the three cards one after another
  useEffect(() => {
    if (phase !== "reveal") return;
    const step = reduce ? 150 : 850;
    const timers = [0, 1, 2].map((i) => setTimeout(() => setFlipped(i + 1), 400 + i * step));
    timers.push(
      setTimeout(() => {
        goldCelebration();
        setPhase("result");
      }, 400 + 3 * step + 500),
    );
    return () => timers.forEach(clearTimeout);
  }, [phase, reduce]);

  // ---- backdrop tint: show Mae Mu Sandy while asking, deepen it once cards/text are on screen
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tarotMood = phase === "ask" ? "portrait" : "reading";
    return () => {
      delete root.dataset.tarotMood;
    };
  }, [phase]);

  function resetForNewQuestion() {
    setQuestion("");
    setResult(null);
    setError(null);
    setPicked([]);
    setFlipped(0);
    setUseFree(freeTickets > 0);
    setPhase("ask");
  }

  return (
    <AnimatePresence mode="wait">
      {/* ---------------- ASK ---------------- */}
      {phase === "ask" && (
        <motion.section
          key="ask"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="flex flex-col gap-5"
        >
          {/* Window onto the room so Mae Mu Sandy is seen at her table before the form */}
          <div className="flex h-[30svh] min-h-40 items-end justify-center">
            <p className="on-photo rounded-full border border-gold/30 bg-velvet/45 px-4 py-1.5 font-serif text-sm text-gold-light backdrop-blur-sm">
              ✦ แม่มูแซนดี้พร้อมเปิดไพ่ให้หนูแล้วค่ะ ✦
            </p>
          </div>

          <MysticCard className="flex flex-col gap-4 p-5 shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.8)]">
            <p className="text-sm leading-relaxed text-cream/90">
              หลับตา หายใจลึกๆ สามครั้ง นึกถึงเรื่องที่ค้างคาใจให้ชัดเจน
              แล้วพิมพ์คำถามที่อยากให้แม่มูช่วยเปิดไพ่ดูนะคะ
            </p>
            <label className="flex flex-col gap-2 text-sm text-cream-muted">
              คำถามของหนู
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
                rows={3}
                placeholder="เช่น ช่วง 3 เดือนนี้การงานของหนูจะเป็นอย่างไร"
                className="resize-none rounded-2xl border border-gold/30 bg-velvet/70 px-4 py-3 text-[15px] text-cream placeholder:text-cream-muted/50 outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30"
              />
              <span className="self-end text-xs text-cream-muted/70">
                {question.length}/{MAX_QUESTION}
              </span>
            </label>

            {freeTickets > 0 && (
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-jade/40 bg-jade/10 px-4 py-3 text-sm text-cream">
                <input
                  type="checkbox"
                  checked={useFree}
                  onChange={(e) => setUseFree(e.target.checked)}
                  className="size-5 accent-[var(--gold)]"
                />
                ใช้สิทธิ์ดูดวงฟรี (เหลือ {freeTickets} ครั้ง)
              </label>
            )}

            <div className="flex items-center justify-between rounded-2xl bg-velvet/60 px-4 py-3 text-sm">
              <span className="text-cream-muted">ค่าเปิดไพ่</span>
              <span className="flex items-center gap-1.5 font-semibold text-gold-light">
                {payingWithTicket ? (
                  "ใช้สิทธิ์ฟรี 1 ครั้ง"
                ) : (
                  <>
                    <CoinIcon className="size-4" /> {formatCoins(PRICE)} เหรียญ
                    <span className="font-normal text-cream-muted">(มี {formatCoins(balance)})</span>
                  </>
                )}
              </span>
            </div>

            {!canAfford && (
              <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 px-4 py-4 text-center text-sm text-cream">
                เหรียญยังไม่พอเปิดไพ่ค่ะ ขาดอีก {formatCoins(PRICE - balance)} เหรียญ
                <GoldButton href="/topup" className="w-full">
                  <CoinIcon className="size-5" /> เติมเหรียญ
                </GoldButton>
              </div>
            )}

            <button
              type="button"
              onClick={startPicking}
              disabled={trimmed.length < 3 || !canAfford}
              className={goldButtonClass({ size: "lg", className: "w-full" })}
            >
              ตั้งจิตแล้ว ไปเลือกไพ่
            </button>
          </MysticCard>
        </motion.section>
      )}

      {/* ---------------- PICK ---------------- */}
      {phase === "pick" && (
        <motion.section
          key="pick"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-5"
        >
          <div className="text-center">
            <p className="on-photo font-serif text-lg text-gold-light">ตั้งจิตแล้วแตะเลือกไพ่ 3 ใบ</p>
            <p className="on-photo mt-1 text-sm text-cream">
              เลือกแล้ว {picked.length}/{PICK_COUNT} · ใบที่ {Math.min(picked.length + 1, 3)} คือ
              {" "}{POSITIONS[Math.min(picked.length, 2)]}
            </p>
          </div>

          <div className="grid w-full grid-cols-7 gap-1.5">
            {Array.from({ length: SPREAD_SIZE }, (_, i) => {
              const order = picked.indexOf(i);
              const isPicked = order !== -1;
              const spreadDone = picked.length >= PICK_COUNT;
              // Deal from the middle of the deck: offset each card toward the centre column, then fan out.
              const col = i % 7;
              const row = Math.floor(i / 7);
              return (
                <motion.button
                  key={i}
                  type="button"
                  aria-label={`ไพ่ใบที่ ${i + 1}${isPicked ? ` (เลือกเป็น${POSITIONS[order]})` : ""}`}
                  aria-pressed={isPicked}
                  onClick={() => pickCard(i)}
                  disabled={isPicked || spreadDone}
                  initial={
                    reduce
                      ? false
                      : { opacity: 0, x: (3 - col) * 46, y: (1 - row) * 70 - 40, rotate: (3 - col) * -9, scale: 0.7 }
                  }
                  animate={{
                    opacity: spreadDone && !isPicked ? 0.4 : 1,
                    x: 0,
                    y: isPicked ? -10 : 0,
                    rotate: isPicked ? 0 : TILTS[i],
                    scale: isPicked ? 1.08 : 1,
                  }}
                  whileHover={isPicked || spreadDone ? undefined : { y: -8, scale: 1.06, rotate: 0 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ delay: reduce ? 0 : 0.08 + i * 0.045, type: "spring", stiffness: 210, damping: 19 }}
                  className={
                    "tarot-sheen relative aspect-[5/8] rounded-[7%] transition-[filter] duration-300 " +
                    "hover:drop-shadow-[0_0_10px_rgb(243_217_139/0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light " +
                    "disabled:cursor-default " +
                    (isPicked ? "z-10 drop-shadow-[0_0_14px_rgb(243_217_139/0.95)]" : "")
                  }
                >
                  <CardBack />
                  {isPicked && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <span className="flex size-6 items-center justify-center rounded-full border border-gold-light bg-[radial-gradient(circle_at_35%_30%,#fff6d5,#d4af37_55%,#8a6a14)] font-tarot text-xs font-bold text-velvet shadow-[0_0_12px_rgb(243_217_139/0.9)]">
                        {order + 1}
                      </span>
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setPhase("ask")}
            disabled={picked.length >= PICK_COUNT}
            className="on-photo text-xs text-cream underline-offset-4 hover:underline disabled:invisible"
          >
            ย้อนกลับไปแก้คำถาม
          </button>
        </motion.section>
      )}

      {/* ---------------- LOADING ---------------- */}
      {phase === "loading" && (
        <motion.section key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <CrystalBallLoader messages={TAROT_MESSAGES} />
        </motion.section>
      )}

      {/* ---------------- REVEAL + RESULT ---------------- */}
      {(phase === "reveal" || phase === "result") && result && (
        <motion.section
          key="reading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-6"
        >
          <div className="grid grid-cols-3 gap-3">
            {result.cards.map((card, i) => (
              <div key={card.id} className="flex flex-col items-center gap-2 text-center">
                <span className="on-photo font-serif text-sm tracking-wide text-gold-light">✦ {card.position} ✦</span>
                <FlipCard
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  card={card}
                  flipped={flipped > i}
                  onFlipped={() => goldSparkleAt(cardRefs.current[i])}
                  className="w-full"
                />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: flipped > i ? 1 : 0 }}
                  transition={{ delay: 0.5 }}
                  className="tarot-name mt-1 min-h-10 font-serif text-[13px] font-semibold leading-snug"
                >
                  {shortThaiName(card.nameTh)}
                  {card.isReversed && (
                    <span className="block text-[11px] font-normal text-[#e8a0aa] [text-shadow:none]">(ไพ่กลับหัว)</span>
                  )}
                </motion.span>
              </div>
            ))}
          </div>

          {phase === "result" && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col gap-4"
            >
              <ReadAloudControl text={result.reading} />

              <ReadingCard
                ref={shareRef}
                title="คำทำนายจากแม่มู"
                subtitle={
                  <>
                    &ldquo;{trimmed}&rdquo;
                    {result.asOf && (
                      <>
                        <br />
                        <span data-testid="as-of">อ่านไพ่ตามเวลา {result.asOf}</span>
                      </>
                    )}
                  </>
                }
                header={
                  <div className="grid grid-cols-3 gap-3">
                    {result.cards.map((card) => (
                      <div key={card.id} className="flex flex-col items-center gap-1.5 text-center">
                        <span className="text-[11px] text-gold">{card.position}</span>
                        <div className="aspect-[5/8] w-16 drop-shadow-[0_0_8px_rgb(212_175_55/0.45)]">
                          <CardFace card={card} reversed={card.isReversed} />
                        </div>
                        <span className="font-serif text-[11px] leading-snug text-gold-light">
                          {shortThaiName(card.nameTh)}
                          {card.isReversed ? " (กลับหัว)" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                }
                text={result.reading}
                onTypingDone={() => setTypingDone(true)}
              />

              <ShareButton targetRef={shareRef} disabled={!typingDone} fileName="mae-mu-sandy-tarot.png" />

              <p className="on-photo text-center text-xs text-cream">
                {result.usedFreeTicket ? "ใช้สิทธิ์ดูดวงฟรีแล้ว" : `หัก ${formatCoins(PRICE)} เหรียญแล้ว`} · คงเหลือ{" "}
                {formatCoins(balance)} เหรียญ
              </p>

              <button type="button" onClick={resetForNewQuestion} className={goldButtonClass({ size: "lg", className: "w-full" })}>
                ถามคำถามใหม่
              </button>
            </motion.div>
          )}
        </motion.section>
      )}

      {/* ---------------- ERROR ---------------- */}
      {phase === "error" && error && (
        <motion.section key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <MysticCard className="flex flex-col items-center gap-4 p-6 text-center">
            <p className="font-serif text-lg text-gold-light">
              {error.code === "INSUFFICIENT_COINS" ? "เหรียญไม่เพียงพอ" : "ขออภัยค่ะ"}
            </p>
            <p className="text-sm leading-relaxed text-cream/90">{error.message}</p>
            {error.code === "INSUFFICIENT_COINS" ? (
              <GoldButton href="/topup" size="lg" className="w-full">
                <CoinIcon className="size-5" /> เติมเหรียญ
              </GoldButton>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPhase("ask");
                }}
                className={goldButtonClass({ size: "lg", className: "w-full" })}
              >
                ลองใหม่อีกครั้ง
              </button>
            )}
          </MysticCard>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
