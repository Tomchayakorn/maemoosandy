"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { goldCelebration } from "@/components/fx/confetti";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { ChestBonusAura, ChestBonusBurst, ChestBonusStrip } from "./Bonus";
import { ChestTile, type TileKind } from "./ChestTile";
import { useSurpriseBlock } from "@/lib/cat-game/surprise-block";
import {
  baseMultiplierBp, BETS, BONUS_UNLOCK_SAFE, MAX_PAYOUT, maxSafe, MINES_OPTIONS, roundPayout, TILES, type Bonus, type RulesVersion,
} from "@/lib/mystic/config";
import type { MysticRoundView } from "@/lib/mystic/types";
import { formatCoins } from "@/lib/pricing";
import { walletBus } from "@/lib/wallet-bus";
import { chestSfx } from "@/lib/audio/chestSfx";
import { rewardTier } from "@/lib/mystic/sfx-tier";

type ApiError = { error?: { message?: string } };
/** Minimum time from the tap to the reveal: the lid stays ajar with a slit of light. Presentation only — the server has already decided. */
const PEEK_MS = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** a clock reading, kept outside the component (the compiler lint treats a direct performance.now() call in a handler as render-impure) */
const nowMs = () => performance.now();
/** ×1.0125, ×2.16, ×75.6 (shortest form with at least 2 decimals) */
const x = (bp: number | null) => {
  if (bp === null) return "—";
  const s = (bp / 10_000).toFixed(4).replace(/0+$/, "");
  return `×${s.endsWith(".") ? s + "00" : s.split(".")[1].length === 1 ? s + "0" : s}`;
};

/** Multiplier after k safe chests including the round's bonus (which only counts from the unlock chest), basis points. */
const effectiveBp = (mines: number, k: number, version: RulesVersion, bonus: Bonus | null) => {
  const bp = baseMultiplierBp(mines, k, version);
  return bp === null ? null : bp * (k >= BONUS_UNLOCK_SAFE ? (bonus ?? 1) : 1);
};

/**
 * เปิดหีบมนตรา — no game logic here. The server places the cursed chests, charges the bet, decides every chest and pays out
 * (POST /api/mystic/start | open | cashout); the client only draws the board and animates. The cursed positions are never sent to the
 * browser while a round is active.
 */
export function MysticGame({
  initialBalance,
  initialRound,
  unavailable = false,
  rules = 1,
}: {
  initialBalance: number;
  /** An unfinished round of this player (so a refresh / a lost connection continues it). */
  initialRound: MysticRoundView | null;
  /** The database tables aren't there yet (migration 0020 not run). */
  unavailable?: boolean;
  /** the rules new rounds are played under (2 = bonus rounds, migration 0025) */
  rules?: RulesVersion;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [balance, setBalance] = useState(initialBalance);
  const [round, setRound] = useState<MysticRoundView | null>(initialRound);
  const [bet, setBet] = useState<number>(BETS[0]);
  const [mines, setMines] = useState<number>(1);
  const [busyTile, setBusyTile] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastTile, setLastTile] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [burst, setBurst] = useState<Bonus | null>(null); // the unlock celebration, decoration only
  const inFlight = useRef(false);
  const balanceRef = useRef(balance);

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(
    () => () => {
      chestSfx.stop(); // leaving the page: cut any sound and release the music ducking
      setBurst(null); // so the celebration does not play again on a Back navigation
    },
    [],
  );

  const active = round?.status === "active";
  useSurpriseBlock(active || busy); // the cat-game surprise waits during a round

  /** Replace the local round and balance with what the server has (after an error or a lost answer). Never throws. */
  async function resync() {
    try {
      const res = await fetch("/api/mystic/state", { cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()) as { round: MysticRoundView | null; balance: number };
      setRound(s.round);
      setBalance(s.balance);
      setLastTile(null);
      walletBus.set(s.balance);
    } catch {
      /* offline: the message already shown stays; the next successful call re-syncs */
    }
  }

  async function call(url: string, body: object): Promise<MysticRoundView | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as (MysticRoundView & ApiError) | null;
      if (!res.ok || !json || !("roundId" in json)) {
        setError(json?.error?.message ?? "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
        await resync(); // take the server's truth (e.g. the round already finished in another tab)
        return null;
      }
      return json;
    } catch {
      setError("เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ");
      await resync(); // the server may have processed the request although the answer was lost: show its state
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function applyBalance(view: MysticRoundView) {
    setBalance(view.balance);
    walletBus.set(view.balance); // header badge
  }

  async function startRound() {
    if (unavailable || busy || balance < bet) return;
    chestSfx.prime(); // unlock audio inside this tap (no sound yet)
    const view = await call("/api/mystic/start", { bet, mines });
    if (!view) return;
    setRound(view);
    setLastTile(null);
    setBurst(null);
    applyBalance(view);
    router.refresh();
  }

  async function openTile(tile: number) {
    if (!round || !active || busy || (round.openedMask >> tile) & 1) return;
    chestSfx.open(); // the tap itself: latch + creak + sparkle, played at once (not after the server answers)
    setBusyTile(tile);
    setLastTile(tile);
    const tapped = nowMs();
    const view = await call("/api/mystic/open", { roundId: round.roundId, tile });
    if (!view) {
      setBusyTile(null); // an error never waits
      return;
    }
    // keep the lid ajar a moment before the reveal (same for safe and cursed). Keep the tap lock until then: `call` released it.
    inFlight.current = true;
    const wait = (reduce ? 120 : PEEK_MS) - (nowMs() - tapped);
    if (wait > 0) await sleep(wait);
    inFlight.current = false;
    setBusyTile(null);
    setRound(view);
    // a safe chest (or an automatic payout): the prize sound, grander for a bigger prize — or the bonus call when this chest unlocked one;
    // a cursed chest gets none
    const won = view.unlocked && view.bonus !== null && view.bonus > 1 ? view.bonus : null;
    if (won && view.status === "active") chestSfx.bonus(won);
    else if (view.status !== "lost") chestSfx.reward(rewardTier(view.payout, view.bet, view.auto));
    if (won) {
      setBurst(won);
      if (won >= 5 && !reduce) goldCelebration();
    }
    if (view.status !== "active") finished(view);
  }

  async function cashOut() {
    if (!round || !active || round.safeCount < 1 || busy) return;
    chestSfx.prime();
    const view = await call("/api/mystic/cashout", { roundId: round.roundId });
    if (!view) return;
    chestSfx.reward(rewardTier(view.payout, view.bet, view.auto)); // coins taken
    setRound(view);
    finished(view);
  }

  function finished(view: MysticRoundView) {
    applyBalance(view);
    if (view.payout > 0) {
      goldCelebration();
      if (view.payout >= view.bet * 5) setTimeout(goldCelebration, 600);
    }
    router.refresh();
  }

  const k = round?.safeCount ?? 0;
  const version: RulesVersion = round ? round.version : rules; // a running round keeps the rules it started with
  const bonus = round?.bonus ?? null;
  const currentBp = round && k > 0 ? effectiveBp(round.mines, k, version, bonus) : null;
  const nextBp = round && k < maxSafe(round.mines) ? effectiveBp(round.mines, k + 1, version, bonus) : null;
  const nextUnlocks = version === 2 && bonus === null && k + 1 === BONUS_UNLOCK_SAFE; // the next safe chest draws the bonus

  return (
    <section className={"flex flex-col text-center " + (active ? "gap-3" : "gap-4")}>
      <ChestHero status={round?.status ?? null} busy={busy} compact={round !== null} still={!!reduce} />

      {/* while a round is running the header badge shows the balance and the panel below holds the numbers that matter: save the row */}
      {!active && (
        <p className="text-sm text-cream-muted">
          เหรียญคงเหลือ <b className="text-gold-light">{formatCoins(balance)}</b> · รับสูงสุด {formatCoins(MAX_PAYOUT)} เหรียญต่อรอบ
        </p>
      )}

      {unavailable && (
        <p className="rounded-2xl border border-gold/30 bg-velvet/70 p-3 text-sm text-gold-light">เกมนี้ยังเตรียมระบบไม่เสร็จ กรุณากลับมาใหม่ภายหลังค่ะ</p>
      )}

      {/* ---- setup ---- */}
      {round === null && !unavailable && (
        <Setup bet={bet} mines={mines} balance={balance} busy={busy} rules={rules} onBet={setBet} onMines={setMines} onStart={startRound} />
      )}

      {/* ---- board ---- */}
      {round && (
        <>
          {/* a bonus round makes room for its one-line strip by drawing the board a little smaller */}
          <div className={"relative mx-auto w-full " + (version === 2 && active ? "max-w-[15.25rem]" : "max-w-[17rem]")}>
            <div className="grid w-full grid-cols-3 gap-2.5" role="group" aria-label="หีบมนตรา">
              {Array.from({ length: TILES }, (_, t) => {
                const opened = ((round.openedMask >> t) & 1) === 1;
                const cursed = round.mineMask !== null && ((round.mineMask >> t) & 1) === 1;
                const kind: TileKind = opened ? (cursed ? "curse-hit" : "gem") : cursed ? "curse-faint" : "closed";
                // the multiplier and coins are shown on the chest that was just opened (the latest safe one)
                const badge =
                  t === lastTile && kind === "gem" && round.safeCount > 0
                    ? { mult: x(effectiveBp(round.mines, round.safeCount, version, bonus)), coins: round.payout }
                    : null;
                return (
                  <ChestTile
                    key={t}
                    index={t}
                    kind={kind}
                    loading={busyTile === t}
                    disabled={!active || busy || opened || busyTile !== null}
                    badge={badge}
                    reduce={!!reduce}
                    onOpen={() => openTile(t)}
                  />
                );
              })}
            </div>
            {/* violet-gold highlight while the round holds a bonus, and the one-off pop when it is unlocked */}
            {bonus !== null && bonus > 1 && round.status !== "lost" && <ChestBonusAura bonus={bonus} />}
            {burst !== null && <ChestBonusBurst bonus={burst} onDone={() => setBurst(null)} />}
          </div>

          {active && (
            <div className="flex flex-col gap-2 rounded-2xl border border-gold/40 bg-velvet/80 p-2.5 text-sm shadow-[0_0_24px_-10px_rgb(168_85_247/0.6)]">
              {version === 2 && <ChestBonusStrip safeCount={k} bonus={bonus} />}
              {/* the stack you hold right now, big, with the multiplier */}
              <div data-testid="mystic-stack" className="flex items-end justify-between gap-3 text-left">
                <div>
                  <p className="text-[11px] text-cream-muted">ยอดสะสมตอนนี้</p>
                  <p className="font-tarot text-3xl leading-none text-gold-gradient" aria-live="polite">
                    {k > 0 ? formatCoins(round.payout) : "0"}
                    <span className="ml-1 font-sans text-sm text-cream">เหรียญ</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-cream-muted">ตัวคูณ</p>
                  <p className="font-tarot text-2xl leading-none text-purple-100">{k > 0 ? x(currentBp) : "—"}</p>
                </div>
              </div>
              <p className="text-left text-xs text-cream-muted">
                เดิมพัน <b className="text-cream">{formatCoins(round.bet)}</b> · จุดอาถรรพ์ <b className="text-cream">{round.mines}</b> จุด · เปิดปลอดภัย{" "}
                <b className="text-gold-light">{k}</b>/{maxSafe(round.mines)} ใบ
              </p>
              {/* the choice: stop and keep the stack, or open on (chance from the public odds) */}
              {k > 0 ? (
                <div data-testid="mystic-choice" className="grid grid-cols-2 gap-2 text-left text-xs leading-snug">
                  <div className="rounded-xl border border-emerald-300/40 bg-emerald-400/5 px-2 py-1">
                    <p className="font-semibold text-emerald-200">✋ หยุดตอนนี้</p>
                    <p className="text-cream">
                      รับ <b className="font-tarot text-sm">{formatCoins(round.payout)}</b> เหรียญ แน่นอน
                    </p>
                  </div>
                  <div className="rounded-xl border border-purple-400/40 bg-purple-500/5 px-2 py-1">
                    <p className="font-semibold text-purple-200">🎲 เปิดต่อ · รอด {nextBp !== null ? Math.round(((TILES - round.mines - k) / (TILES - k)) * 100) : 0}%</p>
                    <p className="text-cream">
                      {nextBp !== null ? (
                        <>
                          ได้ <b className="font-tarot text-sm">{formatCoins(roundPayout(round.bet, round.mines, k + 1, version, bonus))}</b>
                          {nextUnlocks && <span className="text-gold-light"> ขึ้นไป 🎁</span>} หรือเสียหมด
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-left text-xs text-purple-200">เปิดหีบใบแรกเพื่อเริ่มสะสมยอด แล้วเลือกได้ว่าจะรับเหรียญหรือไปต่อ</p>
              )}
              <GoldButton onClick={cashOut} disabled={busy || busyTile !== null || k < 1} size="lg" className="w-full">
                {busy && busyTile === null ? "กำลังรับเหรียญ…" : k < 1 ? "เปิดหีบปลอดภัย 1 ใบก่อน แล้วจึงรับเหรียญได้" : `รับเหรียญทันที ${formatCoins(round.payout)}`}
              </GoldButton>
            </div>
          )}

          {!active && <Result round={round} reduce={!!reduce} onAgain={() => { setRound(null); setLastTile(null); setError(null); setBurst(null); }} canAfford={balance >= BETS[0]} />}
        </>
      )}

      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}

function Setup({
  bet, mines, balance, busy, rules, onBet, onMines, onStart,
}: {
  bet: number;
  mines: number;
  balance: number;
  busy: boolean;
  rules: RulesVersion;
  onBet: (b: number) => void;
  onMines: (m: number) => void;
  onStart: () => void;
}) {
  const chip = (on: boolean) =>
    "flex h-12 min-w-[4rem] flex-1 items-center justify-center rounded-xl border text-sm transition " +
    (on ? "border-gold-light bg-gold/20 text-gold-light" : "border-gold/40 text-cream hover:border-gold-light");
  const enough = balance >= bet;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gold/30 bg-velvet/70 p-4 text-left">
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
      <div>
        <p className="mb-2 text-sm text-cream">เลือกจำนวนจุดอาถรรพ์ (ยิ่งมาก ยิ่งเสี่ยงและตัวคูณยิ่งสูง)</p>
        <div className="flex gap-2" role="radiogroup" aria-label="จุดอาถรรพ์">
          {MINES_OPTIONS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mines === m} onClick={() => onMines(m)} className={chip(mines === m)}>
              {m} จุด
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-gold/20 bg-midnight/60 p-3 text-xs text-cream-muted">
        <p className="mb-1 text-cream">ตัวคูณเมื่อเปิดปลอดภัย (ระดับ {mines} จุด)</p>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5">
          {Array.from({ length: maxSafe(mines) }, (_, i) => (
            <span key={i}>
              {i + 1} ใบ <b className="text-gold-light">{x(baseMultiplierBp(mines, i + 1, rules))}</b>
            </span>
          ))}
        </p>
        {rules === 2 && <p className="mt-1 text-[11px] text-purple-200">ตั้งแต่ใบที่ {BONUS_UNLOCK_SAFE} ตัวคูณจะคูณด้วยโบนัสที่สุ่มได้</p>}
      </div>
      {rules === 2 && <ChestBonusStrip safeCount={null} bonus={null} />}
      {enough ? (
        <GoldButton onClick={onStart} disabled={busy} className="w-full">
          {busy ? "กำลังเริ่มรอบ…" : `เริ่มเปิดหีบ (หัก ${formatCoins(bet)} เหรียญ)`}
        </GoldButton>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gold-light">เหรียญไม่พอสำหรับเดิมพัน {formatCoins(bet)} เหรียญ</p>
          <Link href="/topup" className={goldButtonClass({ className: "w-full" })}>
            เติมเหรียญเลย
          </Link>
        </div>
      )}
    </div>
  );
}

function Result({ round, reduce, onAgain, canAfford }: { round: MysticRoundView; reduce: boolean; onAgain: () => void; canAfford: boolean }) {
  const lost = round.status === "lost";
  return (
    <motion.div
      role="status"
      initial={reduce ? false : { opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className={"flex flex-col items-center gap-2 rounded-3xl border p-5 " + (lost ? "border-rose-400/50 bg-velvet/80" : "border-gold/70 bg-velvet/80 shadow-[0_0_34px_-8px_rgb(212_175_55/0.8)]")}
    >
      {lost ? (
        <>
          <p className="text-2xl">💀</p>
          <p className="font-serif text-lg text-rose-200">เจอจุดอาถรรพ์ รอบนี้จบแล้ว</p>
          <p className="text-sm text-cream-muted">เสียเดิมพัน {formatCoins(round.bet)} เหรียญ ลองเสี่ยงโชคใหม่อีกครั้งนะคะ</p>
        </>
      ) : (
        <>
          <p className="text-xs tracking-widest text-gold/80">{round.auto === "cap" ? "ถึงเพดานรางวัล ✨" : round.auto === "all_open" ? "เปิดหีบปลอดภัยครบทุกใบ ✨" : "รับเหรียญสำเร็จ ✨"}</p>
          <p className="font-tarot text-5xl font-bold text-gold-gradient">+{formatCoins(round.payout)}</p>
          {round.bonus !== null && round.bonus > 1 && <p data-testid="chest-result-bonus" className="text-sm font-semibold text-gold-light">รวมโบนัส ×{round.bonus} แล้ว</p>}
          <p className="text-sm text-cream">เหรียญ เข้ากระเป๋าแล้ว (คงเหลือ {formatCoins(round.balance)})</p>
        </>
      )}
      {canAfford ? (
        <GoldButton variant="outline" onClick={onAgain} className="mt-1 w-full">
          เริ่มรอบใหม่
        </GoldButton>
      ) : (
        <Link href="/topup" className={goldButtonClass({ className: "mt-1 w-full" })}>
          เหรียญไม่พอ เติมเหรียญเลย
        </Link>
      )}
    </motion.div>
  );
}

/**
 * The main chest picture: /mystic-chest.gif (640×360 animated, plain <img> because next/image does not optimise animated GIFs),
 * framed in gold and purple. Over a lost round it fades red, over a win it glows gold. Presentation only.
 */
function ChestHero({ status, busy, compact, still }: { status: MysticRoundView["status"] | null; busy: boolean; compact: boolean; still: boolean }) {
  const tone =
    status === "lost"
      ? "border-rose-400/60 shadow-[0_0_34px_-8px_rgb(244_63_94/0.7)]"
      : status === "cashed" || status === "cleared"
        ? "border-gold-light shadow-[0_0_40px_-6px_rgb(243_217_139/0.9)]"
        : "border-gold/60 shadow-[0_0_34px_-10px_rgb(168_85_247/0.8)]";
  return (
    <div className={"relative overflow-hidden rounded-3xl border bg-velvet transition-shadow duration-500 " + tone}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // a GIF cannot honour prefers-reduced-motion, so those players get a still of its first frame
        src={still ? "/images/mystic-chest-still.jpg" : "/mystic-chest.gif"}
        alt="หีบมนตรา หีบทองคำลึกลับเรืองแสงสีม่วง"
        width={640}
        height={360}
        decoding="async"
        draggable={false}
        className={"w-full object-cover transition-all duration-500 " + (compact ? "aspect-[16/3] object-[50%_42%]" : "aspect-video") + " " + (status === "lost" ? "saturate-50 brightness-75" : "") + (busy ? " brightness-110" : "")}
      />
      {status === "lost" && <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,transparent_40%,rgb(127_29_29/0.55))]" />}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-midnight/80 to-transparent" />
    </div>
  );
}
