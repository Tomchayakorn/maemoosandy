"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { goldCelebration, goldSparkleAt } from "@/components/fx/confetti";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { matchSfx } from "@/lib/audio/matchSfx";
import { formatCountdown, msUntilReset } from "@/lib/cat-game/countdown";
import { useSurpriseBlock } from "@/lib/cat-game/surprise-block";
import { CARDS, CLEAR_BONUS, COST, DAILY_ROUNDS, MAX_PAYOUT, MAX_TURNS, PAIR_REWARD, PAIRS, REVEAL_MS, roundsLeft } from "@/lib/match-game/config";
import { reconcileMatch } from "@/lib/match-game/reconcile";
import { STALE_CODES, type MatchCardFace, type MatchRoundView, type MatchStateResponse } from "@/lib/match-game/types";
import { formatCoins } from "@/lib/pricing";
import { walletBus } from "@/lib/wallet-bus";
import { MatchAuraBackdrop } from "./aura/MatchAuraBackdrop";
import { MatchCard, type CardState } from "./MatchCard";

type ApiError = { error?: { code?: string; message?: string } };
/** the soft light after a found pair (`clear` = it was the last one); `key` restarts it for the next pair */
type Glow = { kind: "pair" | "clear"; key: number; positions: number[] };
/** a sound that answers a flip waits for the card to finish turning */
const AFTER_FLIP = 0.3;

/**
 * จับคู่ภาพเหมือน — no game logic here. The server charges the round, holds the hidden layout, decides every match and pays
 * (POST /api/match-game/start | flip, GET /api/match-game/state); this component only shows what the server has revealed.
 */
export function MatchGame({
  initialBalance,
  initialRound,
  initialRoundsToday,
  unavailable = false,
}: {
  initialBalance: number;
  initialRound: MatchRoundView | null;
  initialRoundsToday: number;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [balance, setBalance] = useState(initialBalance);
  const [round, setRound] = useState<MatchRoundView | null>(initialRound);
  const [roundsToday, setRoundsToday] = useState(initialRoundsToday);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<number | null>(null); // the card tapped, waiting for the server to say what is on it
  const [peek, setPeek] = useState<MatchCardFace[] | null>(null); // two cards that did not match, shown for a moment
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<"match" | "miss" | null>(null);
  const [glow, setGlow] = useState<Glow | null>(null); // decoration only
  const inFlight = useRef(false); // synchronous guard: state lags one render behind a fast double tap
  const peeking = useRef(false); // same, for the moment the two missed cards are face up
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const roundRef = useRef<MatchRoundView | null>(initialRound); // read by async code that would otherwise see an old closure
  const mutationSeq = useRef(0); // bumped by every start / flip: a state read that began before one of them is out of date
  const boardRef = useRef<HTMLDivElement>(null);

  const active = round?.status === "active";
  const finished = round?.status === "finished";
  useSurpriseBlock(active || busy);
  useEffect(
    () => () => {
      // leaving the page (Next keeps this screen's state for a Back navigation): drop the timed reveal so the board cannot stay locked
      clearTimeout(peekTimer.current);
      peeking.current = false;
      setPeek(null);
      setGlow(null); // so the light does not play again on a Back navigation
      matchSfx.stop(); // cut any sound and release the music ducking
    },
    [],
  );

  function showRound(next: MatchRoundView | null) {
    roundRef.current = next;
    setRound(next);
  }

  function applyWallet(coins: number, today: number) {
    setBalance(coins);
    setRoundsToday(today);
    walletBus.set(coins); // header badge
  }

  /**
   * Take the server's truth (after an error or a lost answer, when the page comes back from the browser's cache, when the tab returns).
   * An answer is dropped when a start / flip began after the read did, or one is still running (unless `afterFailure`, i.e. we are inside
   * the failed action itself), or it describes the same round at an earlier step (see reconcileMatch). Never throws.
   */
  async function resync(afterFailure = false) {
    const seq = mutationSeq.current;
    try {
      const res = await fetch("/api/match-game/state", { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as MatchStateResponse;
      if (mutationSeq.current !== seq || (!afterFailure && inFlight.current)) return;
      const out = reconcileMatch(roundRef.current, s.round);
      if (!out.accepted) return;
      showRound(out.round);
      applyWallet(s.balance, s.roundsToday);
    } catch {
      /* offline: the message already shown stays */
    }
  }

  // The screen starts from the props of a server render, which can be old (the page restored from the back/forward cache). Read the real
  // round once on mount and again whenever the page / tab comes back to the foreground.
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

  async function post(url: string, body: object): Promise<MatchRoundView | null> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as (MatchRoundView & ApiError) | null;
      if (!res.ok || !json || !("roundId" in json)) {
        // "your screen is behind" errors only need the fresh state, no message
        const stale = STALE_CODES.some((c) => c === json?.error?.code);
        if (!stale) setError(json?.error?.message ?? "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
        await resync(true);
        return null;
      }
      return json;
    } catch {
      setError("เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ");
      await resync(true); // the server may have processed it although the answer was lost
      return null;
    }
  }

  async function startRound() {
    if (unavailable || inFlight.current || balance < COST || roundsLeft(roundsToday) === 0) return;
    matchSfx.prime(); // unlock audio inside this tap
    inFlight.current = true;
    mutationSeq.current++;
    setBusy(true);
    setError(null);
    setLast(null);
    setGlow(null);
    const view = await post("/api/match-game/start", {});
    if (view) {
      matchSfx.flip();
      showRound(view);
      applyWallet(view.balance, view.roundsToday);
      router.refresh();
      // bring the whole board into view on a phone
      boardRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
    inFlight.current = false;
    setBusy(false);
  }

  async function flip(position: number) {
    const current = roundRef.current;
    // locked: a request on its way, two missed cards still showing, the same card again, or a card already found
    if (!current || current.status !== "active" || inFlight.current || peeking.current) return;
    if (current.open?.position === position || current.matched.some((m) => m.position === position)) return;
    matchSfx.prime();
    matchSfx.flip();
    inFlight.current = true;
    mutationSeq.current++;
    setBusy(true);
    setPending(position);
    setError(null);
    setLast(null);
    const view = await post("/api/match-game/flip", { roundId: current.roundId, position, step: current.step });
    setPending(null);
    if (view) {
      const result = view.flip;
      if (result?.second && !result.match && result.first) {
        peeking.current = true;
        setPeek([result.first, { position: result.position, symbol: result.symbol }]);
        peekTimer.current = setTimeout(() => {
          peeking.current = false;
          setPeek(null);
        }, REVEAL_MS);
      }
      showRound(view);
      applyWallet(view.balance, view.roundsToday);
      if (result?.second) {
        setLast(result.match ? "match" : "miss");
        if (result.match && result.first) setGlow({ kind: view.pairs === PAIRS ? "clear" : "pair", key: view.step, positions: [result.first.position, result.position] });
        if (view.status === "finished") {
          if (view.pairs === PAIRS) {
            matchSfx.clear(AFTER_FLIP);
            goldCelebration();
          } else if (result.match) {
            matchSfx.match(AFTER_FLIP);
            matchSfx.over(AFTER_FLIP + 0.7);
          } else {
            matchSfx.miss(AFTER_FLIP);
            matchSfx.over(AFTER_FLIP + 0.7);
          }
          router.refresh();
        } else if (result.match) {
          matchSfx.match(AFTER_FLIP);
          if (!reduce) goldSparkleAt(document.querySelector(`[data-testid=match-card-${position}]`));
          router.refresh();
        } else {
          matchSfx.miss(AFTER_FLIP);
        }
      }
    }
    inFlight.current = false;
    setBusy(false);
  }

  const matched = new Map((round?.matched ?? []).map((m) => [m.position, m.symbol]));
  const showAll = finished && !peek; // the rest of the board opens after the last missed pair has been seen

  function cardAt(position: number): { symbol: number | null; state: CardState } {
    const missed = peek?.find((p) => p.position === position);
    if (missed) return { symbol: missed.symbol, state: "missed" };
    const found = matched.get(position);
    if (found !== undefined) return { symbol: found, state: "matched" };
    if (round?.open?.position === position) return { symbol: round.open.symbol, state: "open" };
    if (showAll && round?.layout) return { symbol: round.layout[position], state: "revealed" };
    return { symbol: null, state: pending === position ? "pending" : "hidden" };
  }

  const left = roundsLeft(roundsToday);
  const hint = peek
    ? "ยังไม่ใช่คู่กัน จำตำแหน่งไว้นะคะ"
    : round?.open
      ? "เลือกใบที่สองเพื่อหาคู่"
      : last === "match"
        ? `เจอคู่แล้ว! +${PAIR_REWARD} เหรียญ`
        : "เปิดไพ่ 2 ใบ หาสัญลักษณ์ที่เหมือนกัน";

  const cleared = finished && round?.pairs === PAIRS;

  return (
    <section className="flex flex-col gap-3 text-center">
      <p className="text-sm text-cream-muted">
        เหรียญคงเหลือ <b data-testid="match-balance" className="text-gold-light">{formatCoins(balance)}</b> · รอบละ {COST} · สูงสุด {MAX_PAYOUT}
      </p>

      {unavailable && <p className="match-panel rounded-2xl p-3 text-sm text-gold-light">เกมนี้ยังเตรียมระบบไม่เสร็จ กรุณากลับมาใหม่ภายหลังค่ะ</p>}

      {/* the board and everything about the round; scrolled to when a round starts (clear of the sticky header) */}
      <div ref={boardRef} className="flex scroll-mt-20 flex-col gap-3">
        <dl data-testid="match-status" className="grid grid-cols-4 gap-1.5">
          <Chip label="เทิร์น" value={`${round?.turnsUsed ?? 0}/${MAX_TURNS}`} />
          <Chip label="จับคู่ได้" value={`${round?.pairs ?? 0}/${PAIRS}`} />
          <Chip label="ได้เหรียญ" value={`+${round?.payout ?? 0}`} gold />
          <Chip label="เล่นวันนี้" value={`${Math.min(roundsToday, DAILY_ROUNDS)}/${DAILY_ROUNDS}`} />
        </dl>

        <div className="flex min-h-14 flex-col justify-center">
          {active ? (
            <p
              data-testid="match-hint"
              aria-live="polite"
              className={"match-panel mx-auto rounded-full px-5 py-2 font-serif text-sm " + (peek ? "text-rose-200" : last === "match" && !round?.open ? "text-emerald-300" : "text-gold-light")}
            >
              {hint}
            </p>
          ) : finished && peek ? (
            <p className="match-panel mx-auto rounded-full px-5 py-2 font-serif text-sm text-rose-200">ครบ {MAX_TURNS} เทิร์นแล้ว…</p>
          ) : finished && round ? (
            <Summary
              round={round}
              left={left}
              reduce={!!reduce}
              onNext={() => {
                matchSfx.stop();
                showRound(null);
                setError(null);
                setLast(null);
                setGlow(null);
              }}
              onReset={resync}
            />
          ) : unavailable ? null : left === 0 ? (
            <Countdown onReset={resync} />
          ) : balance < COST ? (
            <div className="match-panel flex flex-col items-center gap-2 rounded-3xl p-3">
              <p className="text-sm text-gold-light">เหรียญไม่พอ ต้องมีอย่างน้อย {COST} เหรียญ</p>
              <Link href="/topup" className={goldButtonClass({ className: "w-full" })}>
                เติมเหรียญเลย
              </Link>
            </div>
          ) : (
            <GoldButton
              onClick={startRound}
              disabled={busy}
              size="lg"
              className="h-14 w-full text-lg ring-1 ring-[#ffecbe]/60 ring-offset-2 ring-offset-[#1d1338] shadow-[0_0_26px_-8px_rgb(243_217_139/0.8)]"
              data-testid="match-start"
            >
              {busy ? "กำลังเริ่มรอบ…" : `🎴 เริ่มเล่น (หัก ${COST} เหรียญ)`}
            </GoldButton>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/40 bg-velvet/80 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        {/* on a short phone the board narrows, so all four rows stay above the floating contact button */}
        <div className="relative mx-auto w-full max-w-[max(17rem,calc((100svh-17.5rem)*0.75))] sm:max-w-none">
          {/* decorative 3D light behind the board: no props, no touches */}
          <MatchAuraBackdrop />
          <div data-testid="match-frame" className={"match-frame relative rounded-3xl p-2 " + (cleared ? "match-cleared" : "")}>
            <div data-testid="match-board" className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5">
              {Array.from({ length: CARDS }, (_, position) => {
                const card = cardAt(position);
                return (
                  // keyed by round: a new round starts with fresh, face-down cards
                  <MatchCard
                    key={`${round?.roundId ?? "idle"}-${position}`}
                    position={position}
                    symbol={card.symbol}
                    state={card.state}
                    disabled={!active || busy || !!peek || card.state !== "hidden"}
                    fresh={!!glow?.positions.includes(position)}
                    onFlip={flip}
                  />
                );
              })}
            </div>
            {glow && <span key={glow.key} aria-hidden data-testid="match-glow" data-kind={glow.kind} className={`match-flash match-flash-${glow.kind}`} onAnimationEnd={() => setGlow(null)} />}
          </div>
        </div>
      </div>

      <div data-testid="match-note" className="match-panel flex flex-col gap-2 rounded-3xl p-3">
        <p className="font-serif text-sm text-gold-light">✦ กติกาย่อ ✦</p>
        <ul className="grid grid-cols-3 gap-1.5 text-[11px] leading-snug text-cream-muted">
          <li className="rounded-xl border border-[#e8ce96]/25 bg-velvet/45 px-1 py-1.5">
            จับคู่ได้
            <b className="block font-tarot text-base text-gold-light">+{PAIR_REWARD}</b>
            ต่อคู่
          </li>
          <li className="rounded-xl border border-[#e8ce96]/25 bg-velvet/45 px-1 py-1.5">
            ครบ {PAIRS} คู่
            <b className="block font-tarot text-base text-gold-light">+{CLEAR_BONUS}</b>
            โบนัส
          </li>
          <li className="rounded-xl border border-[#e8ce96]/25 bg-velvet/45 px-1 py-1.5">
            เล่นได้
            <b className="block font-tarot text-base text-gold-light">{DAILY_ROUNDS}</b>
            รอบต่อวัน
          </li>
        </ul>
        <p className="text-xs leading-relaxed text-cream-muted">
          รอบละไม่เกิน {MAX_TURNS} เทิร์น รับสูงสุด {MAX_PAYOUT} เหรียญ รางวัลเข้ากระเป๋าเหรียญทันที
        </p>
      </div>
    </section>
  );
}

function Chip({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className={"match-panel rounded-2xl px-1 py-1.5 " + (gold ? "border-[#f3d98b]/80!" : "")}>
      <dt className="text-[11px] text-cream-muted">{label}</dt>
      <dd className={"font-tarot text-lg leading-tight " + (gold ? "text-gold-light" : "text-cream")}>{value}</dd>
    </div>
  );
}

function Summary({ round, left, reduce, onNext, onReset }: { round: MatchRoundView; left: number; reduce: boolean; onNext: () => void; onReset: () => void }) {
  const cleared = round.pairs === PAIRS;
  const net = round.payout - COST;
  return (
    <motion.div
      role="status"
      data-testid="match-result"
      initial={reduce ? false : { opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={"match-panel relative flex flex-col items-center gap-1.5 rounded-3xl p-4 " + (cleared ? "border-[#f3d98b]/90! shadow-[0_0_34px_-8px_rgb(243_217_139/0.8)]!" : "")}
    >
      {cleared && <span aria-hidden className="match-flash match-flash-clear" />}
      <p className="font-serif text-lg text-gold-light">{cleared ? "✨ จับคู่ครบทั้งกระดาน! ✨" : `ครบ ${MAX_TURNS} เทิร์นแล้ว`}</p>
      <p className="font-tarot text-4xl font-bold text-gold-gradient">+{formatCoins(round.payout)}</p>
      <p className="text-sm text-cream">
        จับคู่ได้ {round.pairs}/{PAIRS} คู่ · ใช้ {round.turnsUsed} เทิร์น{cleared && ` · รวมโบนัส +${CLEAR_BONUS}`}
      </p>
      <p className="text-xs text-cream-muted">
        ค่าเล่น {COST} เหรียญ · สุทธิ <b className={net >= 0 ? "text-emerald-300" : "text-rose-300"}>{net >= 0 ? "+" : "−"}{formatCoins(Math.abs(net))}</b> · คงเหลือ {formatCoins(round.balance)} เหรียญ
      </p>
      {left > 0 ? (
        <GoldButton variant="outline" onClick={onNext} className="mt-1 w-full" data-testid="match-next">
          เล่นรอบถัดไป (เหลือ {left} รอบวันนี้)
        </GoldButton>
      ) : (
        <Countdown onReset={onReset} />
      )}
    </motion.div>
  );
}

/** Time left until the daily rounds come back (00:00 Bangkok). At zero the server state is read again — the server decides. */
function Countdown({ onReset }: { onReset: () => void }) {
  const [ms, setMs] = useState<number | null>(null); // null on the first render: server and browser clocks must not clash
  const reset = useRef(onReset);
  useEffect(() => {
    reset.current = onReset;
  });
  useEffect(() => {
    let previous = msUntilReset(new Date());
    const tick = () => {
      const now = msUntilReset(new Date());
      if (now > previous) reset.current(); // midnight passed
      previous = now;
      setMs(now);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return (
    <div data-testid="match-countdown" className="match-panel flex w-full flex-col items-center rounded-3xl px-3 py-2">
      <p className="text-sm text-gold-light">วันนี้เล่นครบ {DAILY_ROUNDS} รอบแล้วค่ะ</p>
      <p className="text-xs text-cream-muted">
        เล่นได้ใหม่ในอีก <b className="font-tarot text-base text-cream">{ms === null ? "--:--:--" : formatCountdown(ms)}</b>
      </p>
    </div>
  );
}
