"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { celebrateCatReward } from "@/components/cat-game/celebrate";
import { CatBoard } from "@/components/cat-game/CatBoard";
import { playCatGame } from "@/lib/cat-game/client";
import { goldButtonClass } from "@/components/ui/GoldButton";
import { CAT_GAME_COST, CAT_REWARDS, catBlessing } from "@/lib/cat-game/config";
import { formatCountdown, msUntilReset } from "@/lib/cat-game/countdown";
import { formatCoins } from "@/lib/pricing";
import { walletBus } from "@/lib/wallet-bus";

type Played = { reward: number; catIndex: number };

/** The short moment of suspense between the tap and the reveal (the cat shakes meanwhile). Presentation only: the server has already drawn. */
const SUSPENSE_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const tapped = performance.now();
    const out = await playCatGame(index);
    if (!out.ok) return rollback(out.message, out.alreadyPlayed); // an error never waits
    // let the tension build: reveal no sooner than SUSPENSE_MS after the tap (shorter under reduced motion)
    const wait = (reduce ? 150 : SUSPENSE_MS) - (performance.now() - tapped);
    if (wait > 0) await sleep(wait);
    setBalance(out.balance);
    walletBus.release(out.balance);
    setPlayed({ reward: out.reward, catIndex: index });
    setLoadingIndex(null);
    busy.current = false;
    celebrateCatReward(out.reward, tileRefs.current[index]);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-5 text-center">
      <p className="text-sm text-cream-muted">
        ค่าเล่น <b className="text-gold-light">{CAT_GAME_COST}</b> เหรียญ · คงเหลือ <b className="text-gold-light">{formatCoins(balance)}</b> เหรียญ
      </p>

      <DailyRightStatus played={!!played} unavailable={unavailable} onReset={() => router.refresh()} />

      <CatBoard
        chosenIndex={loadingIndex ?? played?.catIndex ?? null}
        loadingIndex={loadingIndex}
        disabled={locked || notEnough}
        onPick={pick}
        tileRefs={tileRefs}
      />

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

      {!played && !unavailable && !notEnough && <p className="text-xs text-cream-muted">แตะน้องเหมียว 1 ตัวที่ใจเรียกได้เลยค่ะ</p>}

      <AnimatePresence>{played && <ResultCard key="result" played={played} reduce={!!reduce} />}</AnimatePresence>
    </section>
  );
}

/**
 * Today's chance: "ยังไม่ได้ใช้ (1/1)" or "ใช้แล้ว (0/1)" with a live countdown to the reset (00:00 Bangkok time). Display only: the daily
 * limit itself is enforced by the database. When the countdown reaches zero the page re-reads the server state, which gives the chance back.
 */
function DailyRightStatus({ played, unavailable, onReset }: { played: boolean; unavailable: boolean; onReset: () => void }) {
  const [now, setNow] = useState<number | null>(null); // set after mount (a clock must not be rendered on the server)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const left = now === null ? null : msUntilReset(new Date(now));
  // when midnight (Bangkok) passes while the page is open, ask the server for the new day's state — once per played state
  const fired = useRef(false);
  useEffect(() => {
    if (!played) fired.current = false;
    else if (left !== null && left <= 0 && !fired.current) {
      fired.current = true;
      onReset();
    }
  }, [played, left, onReset]);
  if (unavailable) return null;
  return (
    <div
      data-testid="daily-right"
      className={"flex flex-col items-center gap-0.5 rounded-2xl border px-3 py-2 " + (played ? "border-gold/30 bg-velvet/60" : "border-emerald-300/40 bg-emerald-400/5")}
    >
      <p className="text-sm text-cream">
        🎟️ สิทธิ์วันนี้:{" "}
        {played ? <b className="text-gold-light">ใช้แล้ว (0/1)</b> : <b className="text-emerald-300">ยังไม่ได้ใช้ (1/1) พร้อมเล่น</b>}
      </p>
      <p className="text-xs text-cream-muted">
        {played ? (
          <>
            กลับมาเล่นได้อีกใน{" "}
            <b data-testid="reset-countdown" className="font-tarot tabular-nums text-gold-light">{left === null ? "--:--:--" : formatCountdown(left)}</b>{" "}
            (00:00 น. เวลาไทย)
          </>
        ) : (
          <>
            สิทธิ์รีเซ็ตใหม่ทุกวัน 00:00 น. (เวลาไทย){left !== null && <> · อีก <span className="tabular-nums">{formatCountdown(left)}</span></>}
          </>
        )}
      </p>
    </div>
  );
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
          <p className="text-xs text-cream-muted">{catBlessing(played.reward)}</p>
          {/* the 5 possible prize levels (public, equal chances): the one you got is lit, the other four fade.
              They are the levels of the draw, NOT amounts hidden under the other cats — the other cats hold nothing. */}
          <div data-testid="reward-ladder" className="mt-1 flex flex-col items-center gap-1">
            <div className="flex flex-wrap justify-center gap-1.5">
              {CAT_REWARDS.map((r) => (
                <span
                  key={r}
                  data-won={r === played.reward}
                  className={
                    "rounded-full border px-2.5 py-0.5 font-tarot text-xs tabular-nums " +
                    (r === played.reward ? "border-gold-light bg-gold/25 text-gold-light" : "border-gold/15 text-cream-muted opacity-40")
                  }
                >
                  {formatCoins(r)}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-cream-muted">ระดับรางวัลที่เป็นไปได้ โอกาสเท่ากันทุกระดับ</p>
          </div>
        </>
      ) : (
        <p className="text-sm text-cream">วันนี้คุณเล่นน้องเหมียวไปแล้วค่ะ ไม่มีการหักเหรียญเพิ่ม</p>
      )}
      <p className="mt-1 text-sm text-gold-light">เล่นได้อีกครั้ง พรุ่งนี้ตั้งแต่ 00:00 น. (เวลาไทย) 🐾</p>
    </motion.div>
  );
}
