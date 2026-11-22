"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { goldCelebration, goldSparkleAt } from "@/components/fx/confetti";
import { goldButtonClass } from "@/components/ui/GoldButton";
import { buildBoard, CAT_GAME_COST } from "@/lib/cat-game/config";
import { formatCoins } from "@/lib/pricing";
import { walletBus } from "@/lib/wallet-bus";

type Played = { reward: number; catIndex: number };
type PlayResponse = { reward: number; balance: number; nextPlayAt: string };

const BOARD = buildBoard();

/**
 * "น้องเหมียว 9 ชีวิต": tap 1 of 9 cats, 9 coins, once a day. No game logic here: the server draws the reward, enforces the daily
 * limit and moves the coins (POST /api/cat-game/play). The client only animates and shows the balance optimistically (walletBus).
 */
export function CatGame({
  initialBalance,
  initialPlayed,
  unavailable = false,
}: {
  initialBalance: number;
  /** Today's play if the player already used the daily chance (from the database). */
  initialPlayed: Played | null;
  /** The database table isn't there yet (migration 0016 not run). */
  unavailable?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [balance, setBalance] = useState(initialBalance);
  const [played, setPlayed] = useState<Played | null>(initialPlayed);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const balanceRef = useRef(balance);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!busy.current) setBalance(initialBalance);
  }, [initialBalance]);
  useEffect(() => {
    if (!busy.current) setPlayed(initialPlayed);
  }, [initialPlayed]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => () => walletBus.release(balanceRef.current), []);

  const notEnough = balance < CAT_GAME_COST;
  const locked = unavailable || !!played || loadingIndex !== null;

  async function pick(index: number) {
    if (busy.current || locked || notEnough) return;
    busy.current = true;
    setError(null);
    const before = balance;
    setLoadingIndex(index);
    setBalance(before - CAT_GAME_COST);
    walletBus.hold(before - CAT_GAME_COST);
    const rollback = (msg: string, alreadyPlayed = false) => {
      setBalance(before);
      walletBus.release(before);
      setLoadingIndex(null);
      setError(msg);
      busy.current = false;
      router.refresh(); // pulls the real state (e.g. "already played today" from another tab)
      if (alreadyPlayed) setPlayed({ reward: 0, catIndex: index });
    };
    try {
      const res = await fetch("/api/cat-game/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catIndex: index }),
      });
      const json = (await res.json().catch(() => null)) as PlayResponse | { error?: { code?: string; message?: string } } | null;
      if (!res.ok || !json || !("reward" in json)) {
        const err = json && "error" in json ? json.error : undefined;
        return rollback(err?.message || "เล่นไม่สำเร็จ ลองใหม่อีกครั้งนะคะ (ไม่มีการหักเหรียญซ้ำ)", err?.code === "ALREADY_PLAYED_TODAY");
      }
      setBalance(json.balance);
      walletBus.release(json.balance);
      setPlayed({ reward: json.reward, catIndex: index });
      setLoadingIndex(null);
      busy.current = false;
      celebrate(json.reward, tileRefs.current[index]);
      router.refresh();
    } catch {
      rollback("เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ");
    }
  }

  return (
    <section className="flex flex-col gap-5 text-center">
      <p className="text-sm text-cream-muted">
        ค่าเล่น <b className="text-gold-light">{CAT_GAME_COST}</b> เหรียญ · คงเหลือ <b className="text-gold-light">{formatCoins(balance)}</b> เหรียญ
      </p>

      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="เลือกน้องเหมียว 1 ตัว">
        {BOARD.map((cat) => {
          const chosen = (loadingIndex ?? played?.catIndex) === cat.index;
          const dimmed = (loadingIndex !== null || !!played) && !chosen;
          return (
            <motion.button
              key={cat.index}
              ref={(el) => {
                tileRefs.current[cat.index] = el;
              }}
              type="button"
              disabled={locked || notEnough}
              onClick={() => pick(cat.index)}
              aria-label={`จิ้ม${cat.label}`}
              whileHover={reduce || locked ? undefined : { scale: 1.05, y: -2 }}
              whileTap={reduce || locked ? undefined : { scale: 0.93 }}
              animate={chosen && loadingIndex !== null && !reduce ? { rotate: [0, -4, 4, -3, 3, 0] } : { rotate: 0 }}
              transition={{ duration: 0.5 }}
              className={
                "group relative aspect-square overflow-hidden rounded-2xl border bg-velvet transition-[box-shadow,opacity,filter] duration-300 " +
                (chosen
                  ? "border-gold-light shadow-[0_0_26px_-2px_rgb(243_217_139/0.9)]"
                  : "border-gold/50 shadow-[0_0_14px_-6px_rgb(212_175_55/0.7)] hover:border-gold-light hover:shadow-[0_0_22px_-4px_rgb(243_217_139/0.85)]") +
                (dimmed ? " opacity-45 saturate-50" : "") +
                " disabled:cursor-default"
              }
            >
              <Image
                src={cat.src}
                alt=""
                fill
                sizes="(max-width: 448px) 30vw, 140px"
                quality={70}
                draggable={false}
                className="object-cover"
              />
              {/* twinkling sparkles on hover / while chosen */}
              <span
                aria-hidden
                className={
                  "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(243_217_139/0.35),transparent_40%),radial-gradient(circle_at_75%_80%,rgb(243_217_139/0.25),transparent_35%)] transition-opacity duration-300 " +
                  (chosen ? "opacity-100" : "opacity-0 group-hover:opacity-100")
                }
              />
              {chosen && loadingIndex !== null && (
                <span aria-hidden className="absolute inset-0 flex animate-pulse items-center justify-center bg-velvet/40 font-tarot text-3xl text-gold">
                  ✦
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {unavailable && (
        <p className="rounded-2xl border border-gold/30 bg-velvet/70 p-3 text-sm text-gold-light">เกมนี้ยังเตรียมระบบไม่เสร็จ กรุณากลับมาใหม่ภายหลังค่ะ</p>
      )}

      {!played && !unavailable && notEnough && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-velvet/70 p-4">
          <p className="text-sm text-gold-light">เหรียญไม่พอ (ต้องใช้ {CAT_GAME_COST} เหรียญ)</p>
          <Link href="/topup" className={goldButtonClass({ className: "w-full" })}>
            เติมเหรียญเลย
          </Link>
        </div>
      )}

      {!played && !unavailable && !notEnough && (
        <p className="text-xs text-cream-muted">แตะน้องเหมียว 1 ตัว · วันนี้ยังเล่นได้ 1 ครั้ง</p>
      )}

      <AnimatePresence>{played && <ResultCard key="result" played={played} reduce={!!reduce} />}</AnimatePresence>
    </section>
  );
}

/** Bigger prize = bigger celebration. */
function celebrate(reward: number, tile: HTMLElement | null) {
  if (reward >= 1000) {
    for (let i = 0; i < 5; i++) setTimeout(goldCelebration, i * 600);
  } else if (reward >= 500) {
    goldCelebration();
    setTimeout(goldCelebration, 500);
  } else if (reward >= 300) {
    goldSparkleAt(tile);
    setTimeout(goldCelebration, 150);
  } else {
    goldSparkleAt(tile);
  }
}

function ResultCard({ played, reduce }: { played: Played; reduce: boolean }) {
  const won = played.reward > 0; // reward 0 = this tab learned the day's chance was already used elsewhere
  const pop = reduce
    ? {}
    : { initial: { opacity: 0, scale: 0.85, y: 16 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { type: "spring" as const, stiffness: 260, damping: 18 } };
  return (
    <motion.div
      {...pop}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl border border-gold/70 bg-velvet/80 p-6 shadow-[0_0_34px_-8px_rgb(212_175_55/0.8)]"
      role="status"
    >
      {won ? (
        <>
          <p className="text-xs tracking-widest text-gold/80">น้องเหมียวมอบโชคให้คุณ ✨</p>
          <motion.p
            className="font-tarot text-5xl font-bold text-gold-gradient"
            animate={reduce ? undefined : { scale: played.reward >= 1000 ? [1, 1.25, 1, 1.15, 1] : [1, 1.15, 1] }}
            transition={{ duration: played.reward >= 1000 ? 1.4 : 0.7 }}
          >
            +{formatCoins(played.reward)}
          </motion.p>
          <p className="text-sm text-cream">เหรียญ เข้ากระเป๋าของคุณแล้ว</p>
        </>
      ) : (
        <p className="text-sm text-cream">วันนี้คุณเล่นน้องเหมียวไปแล้วค่ะ ไม่มีการหักเหรียญเพิ่ม</p>
      )}
      <p className="mt-1 text-sm text-gold-light">เล่นได้อีกครั้ง พรุ่งนี้ตั้งแต่ 00:00 น. (เวลาไทย) 🐾</p>
    </motion.div>
  );
}
