"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { goldCelebration, goldSparkleAt } from "@/components/fx/confetti";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { useSurpriseBlock } from "@/lib/cat-game/surprise-block";
import { BETS, dangerCount, dangerSlices, MAX_LEVEL, MAX_PAYOUT, multiplierBp, payoutFor, reachesCap, SLICES } from "@/lib/power-wheel/config";
import type { PowerRoundView } from "@/lib/power-wheel/types";
import { formatCoins } from "@/lib/pricing";
import { walletBus } from "@/lib/wallet-bus";
import { powerSfx } from "@/lib/audio/powerSfx";
import { rewardTier } from "@/lib/mystic/sfx-tier";
import { reconcileRound } from "@/lib/power-wheel/reconcile";
import { ClimbWheel } from "./ClimbWheel";
import { TowerBackdrop } from "./tower/TowerBackdrop";

type ApiError = { error?: { message?: string } };
const x = (bp: number | null) => (bp === null ? "—" : `×${(bp / 10_000).toFixed(2)}`);
const SPIN_SECONDS = 2.4;
/** a little random offset inside the landing slice (presentation only) */
const jitter = () => (Math.random() - 0.5) * 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * วงล้อไต่ชั้น — no game logic here. The server charges the bet, draws the slice, decides safe/danger and pays out
 * (POST /api/power-wheel/start | spin | stop); the client only draws the wheel and animates it onto the slice the server chose.
 * Prizes go to the coin wallet only.
 */
export function PowerWheelGame({ initialBalance, initialRound, unavailable = false }: { initialBalance: number; initialRound: PowerRoundView | null; unavailable?: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [balance, setBalance] = useState(initialBalance);
  const [round, setRound] = useState<PowerRoundView | null>(initialRound);
  const [bet, setBet] = useState<number>(BETS[0]);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [glow, setGlow] = useState<"idle" | "win" | "lose">("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false); // synchronous guard: state lags one render behind a fast double tap
  const roundRef = useRef<PowerRoundView | null>(initialRound); // the round currently shown (read by async code that would otherwise see an old closure)
  const mutationSeq = useRef(0); // bumped by every start / spin / stop: a state read that began before one of them is out of date
  const rotRef = useRef(0);
  const seconds = reduce ? 0.3 : SPIN_SECONDS;

  const active = round?.status === "active";
  useSurpriseBlock(active || busy); // the cat-game surprise waits during a round
  const balanceRef = useRef(balance);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => () => walletBus.release(balanceRef.current), []);
  useEffect(() => () => powerSfx.stop(), []); // leaving the page: cut any sound and release the music ducking

  /** Show a round and remember it for async code. */
  function showRound(next: PowerRoundView | null) {
    roundRef.current = next;
    setRound(next);
  }

  /**
   * Take the server's truth (after an error or a lost answer, when the page comes back from the browser's cache, when the tab returns).
   * An answer is dropped when it is out of date: a start / spin / stop began after the read did, or (unless `afterFailure`, i.e. we are
   * inside the failed action itself) one is still running, or it describes the same round at an earlier level (see reconcileRound).
   * Never throws.
   */
  async function resync(afterFailure = false) {
    const seq = mutationSeq.current;
    try {
      const res = await fetch("/api/power-wheel/state", { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as { round: PowerRoundView | null; balance: number };
      if (mutationSeq.current !== seq || (!afterFailure && inFlight.current)) return; // overtaken by a newer action
      const out = reconcileRound(roundRef.current, s.round);
      if (!out.accepted) return; // an old answer: keep what the screen shows
      showRound(out.round);
      setBalance(s.balance);
      walletBus.set(s.balance);
    } catch {
      /* offline: the message already shown stays */
    }
  }

  // The screen starts from the props of a server render, which can be old (the page restored from the back/forward cache, or a render
  // that finished late). Read the real round once on mount and again whenever the page / tab comes back to the foreground.
  useEffect(() => {
    void resync();
    const back = (e: PageTransitionEvent) => {
      if (e.persisted && !inFlight.current) void resync();
    };
    const visible = () => {
      if (document.visibilityState === "visible" && !inFlight.current) void resync();
    };
    window.addEventListener("pageshow", back);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("pageshow", back);
      document.removeEventListener("visibilitychange", visible);
    };
    // resync only reads refs and stable setters: run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(url: string, body: object): Promise<PowerRoundView | null> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as (PowerRoundView & ApiError) | null;
      if (!res.ok || !json || !("roundId" in json)) {
        setError(json?.error?.message ?? "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
        await resync(true); // take the server's truth (e.g. the round already finished in another tab)
        return null;
      }
      return json;
    } catch {
      setError("เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ");
      await resync(true); // the server may have processed it although the answer was lost
      return null;
    }
  }

  function applyBalance(view: PowerRoundView) {
    setBalance(view.balance);
    walletBus.set(view.balance); // header badge
  }

  async function startRound() {
    if (unavailable || inFlight.current || balance < bet) return;
    powerSfx.prime(); // unlock audio inside this tap
    inFlight.current = true;
    mutationSeq.current++;
    setBusy(true);
    setError(null);
    setGlow("idle");
    const view = await post("/api/power-wheel/start", { bet });
    if (view) {
      powerSfx.start(); // the bet was taken, the round begins
      showRound(view);
      applyBalance(view);
      router.refresh();
    }
    inFlight.current = false;
    setBusy(false);
  }

  async function spin() {
    if (!round || !active || inFlight.current) return;
    powerSfx.prime(); // unlock audio inside this tap
    inFlight.current = true;
    mutationSeq.current++;
    setBusy(true);
    setError(null);
    setGlow("idle");
    const view = await post("/api/power-wheel/spin", { roundId: round.roundId });
    if (!view) {
      inFlight.current = false;
      setBusy(false);
      return;
    }
    // land the wheel on the slice the server chose (a little jitter inside the slice), then reveal the result
    const slice = view.slice ?? 0;
    const target = (360 - slice * (360 / SLICES) + jitter() + 720) % 360;
    const current = ((rotRef.current % 360) + 360) % 360;
    const degrees = (reduce ? 0 : 3) * 360 + ((target - current + 360) % 360);
    rotRef.current += degrees;
    powerSfx.spin(seconds, degrees / (360 / SLICES), level + 1); // ticks follow the wheel's slowing down; one tick per peg passed
    setSpinning(true);
    setRotation(rotRef.current);
    await sleep(seconds * 1000 + 150);
    setSpinning(false);
    showRound(view);
    setGlow(view.failed ? "lose" : "win");
    // the wheel has stopped: a different sound for falling, for an automatic payout and for clearing a level
    if (view.failed) powerSfx.fail();
    else if (view.status !== "active") powerSfx.reward(rewardTier(view.payout, view.bet, view.auto), view.level);
    else powerSfx.climb(view.level);
    if (!view.failed && !reduce) goldSparkleAt(document.querySelector("[data-testid=climb-wheel]"));
    if (view.status !== "active") finished(view);
    inFlight.current = false;
    setBusy(false);
  }

  async function stop() {
    if (!round || !active || round.level < 1 || inFlight.current) return;
    inFlight.current = true;
    mutationSeq.current++;
    setBusy(true);
    setError(null);
    powerSfx.prime();
    const view = await post("/api/power-wheel/stop", { roundId: round.roundId });
    if (view) {
      powerSfx.reward(rewardTier(view.payout, view.bet, view.auto), view.level); // coins taken
      showRound(view);
      finished(view);
    }
    inFlight.current = false;
    setBusy(false);
  }

  function finished(view: PowerRoundView) {
    applyBalance(view);
    if (view.payout > 0) {
      goldCelebration();
      if (view.payout >= view.bet * 5) setTimeout(goldCelebration, 600);
    }
    router.refresh();
  }

  const level = round?.level ?? 0;
  const nextLevel = level + 1;
  const wheelLevel = round && !active && round.failed ? level + 1 : nextLevel; // after a loss the wheel still shows the level that was failed
  const danger = dangerSlices(Math.min(wheelLevel, MAX_LEVEL));
  const nextBp = level < MAX_LEVEL ? multiplierBp(level + 1) : null;
  const currentBp = level > 0 ? multiplierBp(level) : null;
  const safePct = dangerCount(nextLevel) !== null ? Math.round(((SLICES - dangerCount(nextLevel)!) / SLICES) * 100) : null;

  return (
    <section className="flex flex-col gap-4 text-center">
      <p className="text-sm text-cream-muted">
        เหรียญคงเหลือ <b className="text-gold-light">{formatCoins(balance)}</b> · โบนัสสูงสุดต่อรอบ {formatCoins(MAX_PAYOUT)} เหรียญ
      </p>

      {unavailable && <p className="rounded-2xl border border-gold/30 bg-velvet/70 p-3 text-sm text-gold-light">เกมนี้ยังเตรียมระบบไม่เสร็จ กรุณากลับมาใหม่ภายหลังค่ะ</p>}

      <div className="relative">
        {/* decorative 3D rings centred on the wheel, scrolling with it: they only follow "turning" and the cleared level */}
        <TowerBackdrop spinning={spinning} level={round && !round.failed ? round.level : 0} />
        <ClimbWheel danger={danger} rotation={rotation} seconds={seconds} spinning={spinning} glow={glow} />
      </div>

      {round === null && !unavailable && <Setup bet={bet} balance={balance} busy={busy} onBet={setBet} onStart={startRound} />}

      {round && active && (
        <>
          {/* the two actions sit right under the wheel, in thumb reach and above the stats card (so they stay clear of the floating LINE button) */}
          <div className="flex flex-col gap-2.5">
            <GoldButton onClick={spin} disabled={busy} size="lg" className="h-14 w-full text-lg" data-testid="climb-spin">
              {spinning ? "กำลังหมุน…" : busy ? "กำลังดำเนินการ…" : `🎡 หมุนไต่ชั้นถัดไป (ชั้น ${nextLevel})`}
            </GoldButton>
            <GoldButton variant="outline" onClick={stop} disabled={busy || level < 1} size="lg" className="h-12 w-full border-2 text-base" data-testid="climb-stop">
              {level < 1 ? "ผ่านอย่างน้อย 1 ชั้นก่อน จึงรับเหรียญได้" : `💰 รับเหรียญขั้นนี้ +${formatCoins(round.payout)}`}
            </GoldButton>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border-gold-frame bg-[linear-gradient(160deg,rgb(40_26_70/0.85),rgb(15_12_30/0.95))] p-3.5 shadow-[0_0_30px_-10px_rgb(168_85_247/0.7)]">
            <StatusBar level={level} bet={round.bet} payout={round.payout} currentBp={currentBp} nextBp={nextBp} nextPayout={nextBp !== null ? payoutFor(round.bet, level + 1) : null} safePct={safePct} />
          </div>
        </>
      )}

      {round && !active && <Result round={round} reduce={!!reduce} onAgain={() => { powerSfx.stop(); showRound(null); setError(null); setGlow("idle"); }} canAfford={balance >= BETS[0]} />}

      {error && <p role="alert" className="rounded-xl border border-rose-400/40 bg-velvet/80 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <MultiplierTable level={level} />
    </section>
  );
}

/** Compact status: level, power (multiplier) and accumulated coins, a one-row progress bar and one line about the next level. */
function StatusBar({
  level, bet, payout, currentBp, nextBp, nextPayout, safePct,
}: {
  level: number;
  bet: number;
  payout: number;
  currentBp: number | null;
  nextBp: number | null;
  nextPayout: number | null;
  safePct: number | null;
}) {
  return (
    <div data-testid="climb-status" className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-gold/30 bg-midnight/70 px-1 py-1.5">
          <p className="text-[11px] text-cream-muted">ชั้นปัจจุบัน</p>
          <p className="font-tarot text-2xl leading-tight text-gold-light">
            {level}
            <span className="text-sm text-cream-muted">/{MAX_LEVEL}</span>
          </p>
        </div>
        <div className="rounded-xl border border-purple-300/40 bg-midnight/70 px-1 py-1.5">
          <p className="text-[11px] text-cream-muted">พลังสะสม</p>
          <p className="font-tarot text-2xl leading-tight text-purple-100">{level > 0 ? x(currentBp) : "—"}</p>
        </div>
        <div className="rounded-xl border border-gold/50 bg-gold/10 px-1 py-1.5">
          <p className="text-[11px] text-cream-muted">เหรียญสะสม</p>
          <p className="font-tarot text-2xl leading-tight text-gold-gradient" aria-live="polite">{formatCoins(payout)}</p>
        </div>
      </div>
      <div className="flex gap-0.5" role="progressbar" aria-valuemin={0} aria-valuemax={MAX_LEVEL} aria-valuenow={level} aria-label="ความคืบหน้าของชั้น">
        {Array.from({ length: MAX_LEVEL }, (_, i) => (
          <span key={i} className={"h-1.5 flex-1 rounded-full " + (i < level ? "bg-gold-light shadow-[0_0_6px_rgb(243_217_139/0.8)]" : i === level ? "animate-pulse bg-purple-300/80" : "bg-cream/15")} />
        ))}
      </div>
      <p className="text-xs text-cream-muted">
        เดิมพัน <b className="text-cream">{formatCoins(bet)}</b> · ชั้นถัดไปปลอดภัย <b className="text-cream">{safePct ?? 0}%</b>
        {nextBp !== null && <> · ตัวคูณ <b className="text-purple-100">{x(nextBp)}</b></>}
      </p>
      {/* the next target and the distance to the payout cap (numbers from the same multiplier table and cap the server uses) */}
      {nextPayout !== null && (
        <div data-testid="next-target" className="grid grid-cols-2 gap-2 text-left text-xs leading-snug">
          <div className="rounded-xl border border-purple-300/40 bg-purple-500/5 px-2 py-1">
            <p className="text-purple-200">🎯 ถ้าผ่านชั้นถัดไป</p>
            <p className="text-cream">
              ไปที่ <b data-testid="next-payout" className="font-tarot text-sm">{formatCoins(nextPayout)}</b>
              <span className="text-emerald-300"> (+{formatCoins(Math.max(0, nextPayout - payout))})</span>
            </p>
          </div>
          <div className="rounded-xl border border-gold/40 bg-gold/5 px-2 py-1">
            <p className="text-gold-light">🏁 เพดาน {formatCoins(MAX_PAYOUT)}</p>
            <p className="text-cream" data-testid="cap-left">
              {reachesCap(bet, level + 1) ? (
                <>ชั้นหน้าถึงเพดาน จบรอบ จ่ายเอง</>
              ) : (
                <>
                  อีก <b className="font-tarot text-sm">{formatCoins(Math.max(0, MAX_PAYOUT - payout))}</b> เหรียญ
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** All 12 multipliers, folded away so it does not take over a phone screen. */
function MultiplierTable({ level }: { level: number }) {
  return (
    <details className="group rounded-2xl border border-gold/25 bg-velvet/60 px-3 py-2 text-left">
      <summary className="cursor-pointer list-none text-center text-xs text-gold-light marker:hidden">ดูตารางตัวคูณทุกชั้น <span className="inline-block transition group-open:rotate-180">▾</span></summary>
      <ol className="mt-2 grid grid-cols-3 gap-1.5" aria-label="ตารางตัวคูณ">
        {Array.from({ length: MAX_LEVEL }, (_, i) => {
          const k = i + 1;
          return (
            <li key={k} className={"rounded-lg border px-1.5 py-1 text-center text-[11px] leading-tight " + (k <= level ? "border-gold-light bg-gold/20 text-gold-light" : "border-gold/20 text-cream-muted")}>
              ชั้น {k} <b className="font-tarot">{x(multiplierBp(k))}</b>
              <span className="block text-[10px] opacity-80">ช่อง 💀 {dangerCount(k)}/{SLICES}</span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function Setup({ bet, balance, busy, onBet, onStart }: { bet: number; balance: number; busy: boolean; onBet: (b: number) => void; onStart: () => void }) {
  const chip = (on: boolean) =>
    "flex h-12 min-w-[4rem] flex-1 items-center justify-center rounded-xl border text-sm transition " +
    (on ? "border-gold-light bg-gold/20 text-gold-light" : "border-gold/40 text-cream hover:border-gold-light");
  const enough = balance >= bet;
  // order matters on a phone: bet → START button (right under the wheel, in thumb reach, above the floating LINE button) → the long explanation
  return (
    <div className="flex flex-col gap-3 rounded-3xl border-gold-frame bg-[linear-gradient(160deg,rgb(40_26_70/0.85),rgb(15_12_30/0.95))] p-4 text-left shadow-[0_0_30px_-10px_rgb(168_85_247/0.7)]">
      <div>
        <p className="mb-2 text-sm text-cream">เลือกเดิมพัน (เหรียญ)</p>
        <div className="flex gap-2" role="radiogroup" aria-label="เดิมพัน">
          {BETS.map((b) => (
            <button key={b} type="button" role="radio" aria-checked={bet === b} onClick={() => onBet(b)} className={chip(bet === b)}>
              {formatCoins(b)}
            </button>
          ))}
        </div>
      </div>
      {enough ? (
        <GoldButton onClick={onStart} disabled={busy} size="lg" className="h-14 w-full text-lg" data-testid="climb-start">
          {busy ? "กำลังเริ่มรอบ…" : `เริ่มไต่ชั้น (หัก ${formatCoins(bet)} เหรียญ)`}
        </GoldButton>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gold-light">เหรียญไม่พอสำหรับเดิมพัน {formatCoins(bet)} เหรียญ</p>
          <Link href="/topup" className={goldButtonClass({ className: "w-full" })}>เติมเหรียญเลย</Link>
        </div>
      )}
      <p className="rounded-xl border border-gold/20 bg-midnight/60 p-3 text-xs leading-relaxed text-cream-muted">
        หมุนวงล้อทีละชั้น ช่อง ✨ คือผ่านชั้นและพลังสะสมเพิ่ม ช่อง 💀 คือจบรอบและเสียเดิมพัน ยิ่งชั้นสูง ช่อง 💀 ยิ่งมาก กดหยุดรับเหรียญได้ทุกเมื่อหลังผ่านอย่างน้อย 1 ชั้น รางวัลสะสมเข้ากระเป๋าเหรียญและใช้ในระบบเท่านั้น
      </p>
    </div>
  );
}

function Result({ round, reduce, onAgain, canAfford }: { round: PowerRoundView; reduce: boolean; onAgain: () => void; canAfford: boolean }) {
  const lost = round.status === "lost";
  return (
    <motion.div
      role="status"
      data-testid="climb-result"
      initial={reduce ? false : { opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className={"flex flex-col items-center gap-2 rounded-3xl border p-5 " + (lost ? "border-rose-400/50 bg-velvet/80" : "border-gold/70 bg-velvet/80 shadow-[0_0_34px_-8px_rgb(212_175_55/0.8)]")}
    >
      {lost ? (
        <>
          <p className="text-2xl">💀</p>
          <p className="font-serif text-lg text-rose-200">ตกช่องอันตราย รอบนี้จบแล้ว</p>
          <p className="text-sm text-cream-muted">เสียเดิมพัน {formatCoins(round.bet)} เหรียญ ลองเสี่ยงโชคใหม่อีกครั้งนะคะ</p>
        </>
      ) : (
        <>
          <p className="text-xs tracking-widest text-gold/80">{round.auto === "cap" ? "ถึงโบนัสสูงสุดต่อรอบ ✨" : round.auto === "top" ? "ไต่ถึงชั้นสูงสุด ✨" : "รับเหรียญสำเร็จ ✨"}</p>
          <p className="font-tarot text-5xl font-bold text-gold-gradient">+{formatCoins(round.payout)}</p>
          <p data-testid="climb-credited" className="text-sm text-cream">✓ รางวัลสะสมเข้ากระเป๋าเหรียญเรียบร้อยแล้ว (คงเหลือ {formatCoins(round.balance)} เหรียญ)</p>
        </>
      )}
      {canAfford ? (
        <GoldButton variant="outline" onClick={onAgain} className="mt-1 w-full">เริ่มรอบใหม่</GoldButton>
      ) : (
        <Link href="/topup" className={goldButtonClass({ className: "mt-1 w-full" })}>เหรียญไม่พอ เติมเหรียญเลย</Link>
      )}
    </motion.div>
  );
}
