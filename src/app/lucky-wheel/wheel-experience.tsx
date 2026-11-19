"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { goldCelebration } from "@/components/fx/confetti";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { formatCoins, WHEEL_SPIN_COST } from "@/lib/pricing";
import { FantasyWheel } from "@/components/wheel/FantasyWheel";
import { SpinFx, type SpinFxState } from "@/components/wheel/SpinFx";
import { walletBus } from "@/lib/wallet-bus";
import { wheelSfx, type SweepDir, type WheelFx } from "@/lib/audio/wheelSfx";
import { WHEEL_SEGMENTS, type CheckinResponse, type SpinResponse } from "@/lib/wheel/segments";

const N = WHEEL_SEGMENTS.length;
const STEP = 360 / N;
const SPIN_SECONDS = 5;

type ApiError = { code: string; message: string };

export function WheelExperience({
  initialTickets,
  initialBalance,
  initialCheckedIn,
  initialFreeReadings,
}: {
  initialTickets: number;
  initialBalance: number;
  initialCheckedIn: boolean;
  initialFreeReadings: number;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [tickets, setTickets] = useState(initialTickets);
  const [balance, setBalance] = useState(initialBalance);
  const [freeReadings, setFreeReadings] = useState(initialFreeReadings);
  const [checkedIn, setCheckedIn] = useState(initialCheckedIn);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SpinResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fx, setFx] = useState<SpinFxState | null>(null);
  const wheelBox = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const pending = useRef<SpinResponse | null>(null);
  const balanceRef = useRef(initialBalance);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seconds = reduce ? 0.4 : SPIN_SECONDS;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      wheelSfx.stop();
    },
    [],
  );

  // Follow fresh server values after router.refresh() — but never mid-spin (that would spoil the result).
  useEffect(() => {
    if (!spinning && !pending.current) {
      setTickets(initialTickets);
      setBalance(initialBalance);
      setFreeReadings(initialFreeReadings);
    }
  }, [initialTickets, initialBalance, initialFreeReadings, spinning]);

  // Never leave the header badge frozen if the page is left mid-spin.
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => () => walletBus.release(balanceRef.current), []);

  /** Called once per spin when the wheel has stopped. Idempotent. */
  function finish() {
    const res = pending.current;
    if (!res) return;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    setFx(null); // fade the overlay out…
    wheelSfx.stop(); // …and the spin sound, right as the reward modal appears
    setTickets(res.spinTickets);
    setBalance(res.balance);
    setFreeReadings(res.freeReadingTickets);
    walletBus.release(res.balance); // header badge: reveal the final balance together with the prize modal
    setResult(res);
    setSpinning(false);
    if (res.reward.type !== "none") {
      goldCelebration();
      if (res.reward.value >= 5000) {
        setTimeout(goldCelebration, 700);
        setTimeout(goldCelebration, 1400);
      }
    }
    router.refresh(); // header menu shows spin tickets
  }

              async function spin() {
    if (spinning || !canSpin) return;
    setError(null);
    setNotice(null);
    setResult(null);

    const before = { tickets, balance };
    if (tickets > 0) {
      setTickets(tickets - 1);
      walletBus.hold();
    } else {
      setBalance(balance - WHEEL_SPIN_COST);
      walletBus.hold(balance - WHEEL_SPIN_COST);
    }

    setSpinning(true);
    wheelSfx.prime();

   const durationSec = reduce ? 0.8 : Math.min(seconds || 2.6, 2.6);
    

    if (!reduce) {
      const effect: WheelFx = (["zodiac", "orbit"] as const)[
        Math.floor(Math.random() * 2)
      ];
      const dir: SweepDir = Math.random() < 0.5 ? 1 : -1;
      const box = wheelBox.current?.getBoundingClientRect();
      setFx({
        id: Math.floor(Math.random() * 1e9) + 1,
        effect,
        dir,
        cx: box ? box.left + box.width / 2 : window.innerWidth / 2,
        cy: box ? box.top + box.height / 2 : window.innerHeight / 2,
        seconds: durationSec,
      });
      wheelSfx.play(effect, { seconds: durationSec, dir });
    } else {
      wheelSfx.play("orbit", { seconds: durationSec, dir: 1 });
    }

    const revert = () => {
      if (timer.current) clearTimeout(timer.current);
      setFx(null);
      wheelSfx.stop();
      setTickets(before.tickets);
      setBalance(before.balance);
      walletBus.release(before.balance);
    };

    try {
      const r = await fetch("/api/lucky-wheel/spin", { method: "POST" });
      const body = await r.json().catch(() => ({
        error: { code: "INTERNAL", message: "หมุนไม่สำเร็จ" },
      }));

      if (!r.ok) {
        revert();
        setError((body as { error?: ApiError }).error?.message ?? "หมุนไม่สำเร็จ");
        const code = (body as { error?: ApiError }).error?.code;
        if (code === "NO_SPIN_TICKETS") setTickets(0);
        if (code === "INSUFFICIENT_COINS") {
          setTickets(0);
          setBalance((b) => Math.min(b, WHEEL_SPIN_COST - 1));
        }
        router.refresh();
        setSpinning(false);
        return;
      }

      const res = body as SpinResponse;

      // สั่งหมุนไปหยุดตรงช่องรางวัลจริง "ครั้งเดียว"
      const offset = (Math.random() - 0.5) * STEP * 0.7;
      const target = (360 - (res.segmentIndex * STEP + offset) + 720) % 360;
      const current = ((rotationRef.current % 360) + 360) % 360;
      const delta = (target - current + 360) % 360;
      const turns = reduce ? 0 : 2;
      const finalNext = rotationRef.current + turns * 360 + delta;

      rotationRef.current = finalNext;
      pending.current = res;
      setRotation(finalNext);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(finish, durationSec * 1000 + 150);
    } catch {
      revert();
      router.refresh();
      setError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งนะคะ");
      setSpinning(false);
    }
  }
  async function checkin() {
    if (checking || checkedIn) return;
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/lucky-wheel/checkin", { method: "POST" });
      const body = await r.json();
      if (!r.ok) {
        setError((body as { error?: ApiError }).error?.message ?? "เช็กอินไม่สำเร็จ ลองใหม่อีกครั้งนะคะ");
        return;
      }
      const res = body as CheckinResponse;
      setTickets(res.spinTickets);
      setCheckedIn(true);
      setNotice(res.granted ? "เช็กอินสำเร็จ ได้สิทธิ์หมุนเพิ่ม 1 ครั้ง ✨" : "วันนี้เช็กอินไปแล้วค่ะ พรุ่งนี้มารับสิทธิ์ใหม่นะคะ");
      router.refresh();
    } catch {
      setError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งนะคะ");
    } finally {
      setChecking(false);
    }
  }

  const jackpot = result?.reward.value === 5000;
  const hasFree = tickets > 0;
  const canPay = !hasFree && balance >= WHEEL_SPIN_COST;
  const canSpin = hasFree || canPay;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Tickets */}
      <div
        aria-live="polite"
        className="rounded-full border border-gold/50 bg-velvet/80 px-5 py-2 text-sm text-cream shadow-[0_0_16px_-4px_rgb(212_175_55/0.5)]"
      >
        สิทธิ์หมุนฟรีคงเหลือ{" "}
        <b data-testid="spin-tickets" className="font-tarot text-lg tabular-nums text-gold-light">
          {tickets}
        </b>{" "}
        ครั้ง
      </div>

      {/* Wheel (extends to the screen edges so the flame ring has room on phones) */}
      <div ref={wheelBox} data-wheel-box className="relative -mx-4 w-[calc(100%+2rem)] max-w-[30rem] self-center">
        <FantasyWheel rotation={rotation} seconds={seconds} spinning={spinning} onComplete={finish} />
      </div>

      {/* Actions */}
      <div className="flex w-full flex-col items-center gap-3">
        {canSpin ? (
          <GoldButton size="lg" className="w-full" onClick={spin} disabled={spinning}>
            {spinning
              ? "กำลังหมุน..."
              : hasFree
                ? `หมุนฟรี (ใช้สิทธิ์คงเหลือ ${tickets} สิทธิ์)`
                : `หมุนต่อ (ใช้ ${WHEEL_SPIN_COST} เหรียญ)`}
          </GoldButton>
        ) : (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-center text-sm text-cream-muted">
              สิทธิ์หมุนฟรีหมดแล้ว และเหรียญไม่พอสำหรับหมุนต่อ ({WHEEL_SPIN_COST} เหรียญ/ครั้ง)
            </p>
            <Link href="/topup" className={goldButtonClass({ size: "lg", className: "w-full" })}>
              เหรียญไม่พอ เติมเหรียญเลย
            </Link>
          </div>
        )}
        <p aria-live="polite" className="text-center text-xs text-cream-muted">
          {!hasFree && <>หมุนต่อได้ไม่จำกัด ครั้งละ {WHEEL_SPIN_COST} เหรียญ · </>}
          เหรียญคงเหลือ <b data-testid="coin-balance" className="tabular-nums text-gold-light">{formatCoins(balance)}</b>
        </p>
        {freeReadings > 0 && (
          <Link
            href="/tarot"
            data-testid="free-readings"
            className="rounded-full border border-gold/50 bg-gold/10 px-4 py-1.5 text-xs text-gold-light"
          >
            ✨ สิทธิ์ดูดวงฟรี {freeReadings} ครั้ง — ใช้ได้เลยที่หน้าดูดวง
          </Link>
        )}

        <GoldButton variant="outline" className="w-full" onClick={checkin} disabled={checkedIn || checking || spinning}>
          {checkedIn ? "เช็กอินวันนี้แล้ว ✓" : checking ? "กำลังเช็กอิน..." : "เช็กอินรายวัน รับสิทธิ์หมุน +1"}
        </GoldButton>

        {notice && <p role="status" className="text-center text-sm text-gold-light">{notice}</p>}
        {error && <p role="alert" className="text-center text-sm text-ruby">{error}</p>}
      </div>

      <MysticCard className="w-full px-5 py-4 text-sm text-cream-muted">
        <p className="mb-1 font-serif text-gold-light">รางวัลบนกงล้อ</p>
        <p>
          เหรียญโบนัส 10 · 20 · 50 เหรียญ, สิทธิ์ดูดวงฟรี และแจ็กพอตใหญ่ 5,000 เหรียญ เช็กอินได้วันละครั้ง (เวลาไทย)
          เมื่อสิทธิ์ฟรีหมด หมุนต่อได้ไม่จำกัดครั้งละ {WHEEL_SPIN_COST} เหรียญ
        </p>
      </MysticCard>

      {/* Random full-screen spin effect (click-through; unmounted → fades out when the wheel stops) */}
      <AnimatePresence>{fx && <SpinFx key={fx.id} fx={fx} />}</AnimatePresence>

      {/* Result modal */}
      <AnimatePresence>
        {result && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-velvet/80 px-5 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="ผลการหมุนกงล้อ"
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm"
            >
              <MysticCard className="flex flex-col items-center gap-4 px-6 py-8 text-center">
                {result.reward.type === "none" ? (
                  <>
                    <p className="font-display text-3xl text-gold-light">ลองใหม่อีกครั้งนะคะ</p>
                    <p className="text-sm text-cream-muted">ครั้งนี้ยังไม่ได้รางวัล แต่โชคดีรออยู่ข้างหน้าค่ะ</p>
                  </>
                ) : (
                  <>
                    <p className="font-serif text-xs tracking-[0.25em] text-gold/90">
                      {jackpot ? "✦ แจ็กพอตใหญ่ ✦" : "✦ ยินดีด้วยค่ะ ✦"}
                    </p>
                    <p data-testid="reward-label" className="font-display text-4xl leading-snug text-gold-gradient">
                      {result.reward.type === "coins"
                        ? `+${result.reward.value.toLocaleString("th-TH")} เหรียญ`
                        : "สิทธิ์ดูดวงฟรี"}
                    </p>
                    <p className="text-sm text-cream-muted">
                      {result.reward.type === "coins"
                        ? `ยอดเหรียญคงเหลือ ${result.balance.toLocaleString("th-TH")} เหรียญ`
                        : `สิทธิ์ดูดวงฟรีคงเหลือ ${result.freeReadingTickets} ครั้ง ใช้ได้ที่หน้าไพ่ยิปซีและดวงวันเกิด`}
                    </p>
                  </>
                )}
                {result.paid && (
                  <p data-testid="paid-note" className="text-xs text-cream-muted">
                    ใช้ {formatCoins(result.cost)} เหรียญในการหมุนครั้งนี้ · เหรียญคงเหลือ {formatCoins(result.balance)} เหรียญ
                  </p>
                )}
                <div className="mt-2 flex w-full flex-col gap-2">
                  {result.spinTickets > 0 ? (
                    <GoldButton className="w-full" onClick={() => setResult(null)}>
                      หมุนฟรีต่อ (เหลือ {result.spinTickets} สิทธิ์)
                    </GoldButton>
                  ) : result.balance >= WHEEL_SPIN_COST ? (
                    <GoldButton className="w-full" onClick={() => setResult(null)}>
                      ปิดแล้วหมุนต่อ (ใช้ {WHEEL_SPIN_COST} เหรียญ)
                    </GoldButton>
                  ) : (
                    <Link href="/topup" className={goldButtonClass({ className: "w-full" })}>
                      เหรียญไม่พอ เติมเหรียญเลย
                    </Link>
                  )}
                  {result.reward.type === "free_reading" && (
                    <Link href="/tarot" className={goldButtonClass({ variant: "outline", className: "w-full" })}>
                      ไปดูดวงเลย
                    </Link>
                  )}
                  <GoldButton variant="ghost" className="w-full" onClick={() => setResult(null)}>
                    ปิด
                  </GoldButton>
                </div>
              </MysticCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
