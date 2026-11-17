"use client";

import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { motion, type Easing, type Transition } from "framer-motion";
import { REAPER_IMPACT_S, type SweepDir, type WheelFx } from "@/lib/audio/wheelSfx";

export type SpinFxState = {
  /** Unique per spin: remounts the overlay and seeds its randomness. */
  id: number;
  effect: WheelFx;
  dir: SweepDir;
  /** Wheel centre in viewport pixels (coins burst out of it, the ring orbits it). */
  cx: number;
  cy: number;
  seconds: number;
};

/** Small deterministic PRNG (pure render: same seed ⇒ same layout). */
function rng(seed: number) {
  let s = (seed % 2147483647) || 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const GOLD_BLUE_GLOW = "0 0 22px 4px rgba(255,200,70,0.55), 0 0 40px 8px rgba(80,140,255,0.35)";

/**
 * Full-screen, click-through overlay shown while the wheel spins. The parent unmounts it
 * (inside <AnimatePresence>) when the wheel stops, so every effect fades out via `exit`.
 */
export function SpinFx({ fx }: { fx: SpinFxState }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
      transition={{ duration: 0.25 }}
    >
      {fx.effect === "coins" && <CoinBurst fx={fx} />}
      {fx.effect === "zodiac" && <ZodiacSweep fx={fx} />}
      {fx.effect === "orbit" && <PrizeOrbit fx={fx} />}
      {fx.effect === "reaper" && <GrimReaper fx={fx} />}
    </motion.div>
  );
}

/* ───────────────────────── 1. golden coins bursting at the viewer ───────────────────────── */

function CoinBurst({ fx }: { fx: SpinFxState }) {
  const coins = useMemo(() => {
    const r = rng(fx.id);
    const waves = 3;
    const per = 9;
    return Array.from({ length: waves * per }, (_, i) => {
      const wave = Math.floor(i / per);
      const ang = r() * Math.PI * 2;
      const dist = 140 + r() * 360;
      return {
        size: 38 + r() * 46,
        dx: Math.cos(ang) * dist * 1.2,
        dy: Math.sin(ang) * dist * 1.5,
        end: 1.6 + r() * 2.4, // scale at the end: flying toward the screen
        spin: 360 * (1 + Math.floor(r() * 3)) * (r() > 0.5 ? 1 : -1),
        tilt: (r() - 0.5) * 120,
        delay: wave * (fx.seconds / 3.4) + r() * 0.45,
        dur: 1.5 + r() * 0.9,
      };
    });
  }, [fx.id, fx.seconds]);

  const sparks = useMemo(() => {
    const r = rng(fx.id + 77);
    return Array.from({ length: 30 }, (_, i) => {
      const ang = r() * Math.PI * 2;
      const dist = 90 + r() * 330;
      return {
        dx: Math.cos(ang) * dist * 1.2,
        dy: Math.sin(ang) * dist * 1.4,
        size: 10 + r() * 14,
        delay: (i % 3) * (fx.seconds / 3.4) + r() * 0.6,
        dur: 0.9 + r() * 0.8,
      };
    });
  }, [fx.id, fx.seconds]);

  return (
    <div style={{ perspective: 800 }} className="absolute inset-0">
      {sparks.map((s, i) => (
        <motion.span
          key={`s${i}`}
          className="absolute text-gold-light"
          style={{ left: fx.cx, top: fx.cy, fontSize: s.size, textShadow: "0 0 10px #ffd35a" }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
          animate={{ x: s.dx, y: s.dy, opacity: [0, 1, 0], scale: [0.3, 1.2, 0.4] }}
          transition={{ duration: s.dur, delay: s.delay, ease: "easeOut" }}
        >
          ✦
        </motion.span>
      ))}
      {coins.map((c, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: fx.cx - c.size / 2, top: fx.cy - c.size / 2, width: c.size, height: c.size }}
          initial={{ x: 0, y: 0, scale: 0.12, opacity: 0, rotateY: 0, rotateZ: 0, filter: "blur(8px)" }}
          animate={{
            x: [0, c.dx * 0.5, c.dx],
            y: [0, c.dy * 0.5, c.dy],
            scale: [0.12, c.end * 0.7, c.end],
            rotateY: [0, c.spin],
            rotateZ: [0, c.tilt],
            opacity: [0, 1, 1, 0],
            filter: ["blur(8px)", "blur(0px)", "blur(0px)", "blur(5px)"],
          }}
          transition={{
            // `times` must match each property's keyframe count, so it is set per property
            default: { duration: c.dur, delay: c.delay, ease: "easeOut" },
            opacity: { duration: c.dur, delay: c.delay, times: [0, 0.3, 0.8, 1] },
            filter: { duration: c.dur, delay: c.delay, times: [0, 0.3, 0.8, 1] },
          }}
        >
          <Coin />
        </motion.div>
      ))}
    </div>
  );
}

function Coin() {
  return (
    <div
      className="relative size-full rounded-full"
      style={{
        background: "conic-gradient(from 30deg, #fff3b0, #d9a93a, #8a6410, #f6dc8a, #c99a2e, #fff3b0)",
        boxShadow: "0 0 22px 4px rgba(255,200,70,0.55), inset 0 0 0 3px rgba(90,60,5,0.55), inset 0 2px 4px rgba(255,255,255,0.7)",
      }}
    >
      <div
        className="absolute inset-[13%] flex items-center justify-center rounded-full text-[0.9em] font-bold"
        style={{
          background: "radial-gradient(circle at 35% 30%, #fff7cf, #e2b43e 55%, #8a6410)",
          border: "2px solid rgba(90,60,5,0.6)",
          color: "#6b4a0a",
          fontSize: "1.1em",
        }}
      >
        ✦
      </div>
    </div>
  );
}

/* ───────────────────────── 2. zodiac symbols & chakra mandalas sweeping across ───────────────────────── */

const ZODIAC = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

function ZodiacSweep({ fx }: { fx: SpinFxState }) {
  const items = useMemo(() => {
    const r = rng(fx.id);
    const count = 12;
    const lastStart = Math.max(0.2, fx.seconds - 2.1);
    const order = [...ZODIAC.keys()].sort(() => r() - 0.5);
    return Array.from({ length: count }, (_, i) => ({
      kind: i % 3 === 2 ? ("chakra" as const) : ("zodiac" as const),
      glyph: ZODIAC[order[i]],
      top: 6 + r() * 78, // % of viewport height
      size: 46 + r() * 40,
      delay: (i / count) * lastStart + r() * 0.2,
      dur: 1.5 + r() * 0.7,
      wobble: (r() - 0.5) * 60,
      hue: i % 2 === 0 ? "#f3d98b" : "#8fb8ff",
    }));
  }, [fx.id, fx.seconds]);

  const from = fx.dir > 0 ? "-30vw" : "130vw";
  const to = fx.dir > 0 ? "130vw" : "-30vw";

  return (
    <div className="absolute inset-0">
      {items.map((it, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ top: `${it.top}%`, left: 0, width: it.size, height: it.size }}
          initial={{ x: from, opacity: 0 }}
          animate={{ x: [from, to], y: [0, it.wobble, 0], opacity: [0, 1, 1, 0] }}
          transition={{
            default: { duration: it.dur, delay: it.delay, ease: "easeInOut" },
            opacity: { duration: it.dur, delay: it.delay, times: [0, 0.12, 0.88, 1] },
          }}
        >
          {/* starlight trail behind the symbol */}
          {Array.from({ length: 7 }, (_, k) => (
            <span
              key={k}
              className="absolute rounded-full"
              style={{
                top: "50%",
                [fx.dir > 0 ? "right" : "left"]: it.size * 0.7 + k * (it.size * 0.34),
                width: Math.max(2, 9 - k),
                height: Math.max(2, 9 - k),
                marginTop: ((k % 3) - 1) * 6,
                background: it.hue,
                opacity: 0.85 - k * 0.11,
                boxShadow: `0 0 10px 2px ${it.hue}`,
              }}
            />
          ))}
          {it.kind === "zodiac" ? (
            <div
              className="flex size-full items-center justify-center rounded-full font-serif"
              style={{
                fontSize: it.size * 0.62,
                color: it.hue,
                textShadow: `0 0 14px ${it.hue}, 0 0 30px rgba(80,140,255,0.6)`,
                border: `1.5px solid ${it.hue}`,
                background: "radial-gradient(circle, rgba(18,26,80,0.75), rgba(10,14,50,0.25))",
                boxShadow: GOLD_BLUE_GLOW,
              }}
            >
              {it.glyph}
            </div>
          ) : (
            <Chakra size={it.size} hue={it.hue} dur={it.dur} />
          )}
        </motion.div>
      ))}
    </div>
  );
}

function Chakra({ size, hue, dur }: { size: number; hue: string; dur: number }) {
  return (
    <motion.svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      style={{ filter: `drop-shadow(0 0 8px ${hue}) drop-shadow(0 0 16px rgba(80,140,255,0.6))` }}
      animate={{ rotate: 360 }}
      transition={{ duration: dur * 2.2, repeat: Infinity, ease: "linear" }}
    >
      <circle r="46" fill="rgba(14,20,70,0.5)" stroke={hue} strokeWidth="2" />
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} cx="0" cy="-30" rx="7" ry="15" fill="none" stroke={i % 2 ? "#8fb8ff" : "#f3d98b"} strokeWidth="1.6" transform={`rotate(${i * 30})`} />
      ))}
      <circle r="22" fill="none" stroke={hue} strokeWidth="1.5" strokeDasharray="3 4" />
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d="M0 -20 L5 0 L0 20 L-5 0 Z" fill="rgba(255,214,110,0.25)" stroke="#f3d98b" strokeWidth="1" transform={`rotate(${i * 30})`} />
      ))}
      <circle r="6" fill={hue} />
    </motion.svg>
  );
}

/* ───────────────────────── 3. holographic prize cards orbiting in a 3D ring ───────────────────────── */

const PRIZES = [
  { label: "10", sub: "เหรียญ", jackpot: false },
  { label: "20", sub: "เหรียญ", jackpot: false },
  { label: "50", sub: "เหรียญ", jackpot: false },
  { label: "ดูดวงฟรี", sub: "สิทธิ์ 1 ครั้ง", jackpot: false },
  { label: "5,000", sub: "แจ็กพอตใหญ่", jackpot: true },
];

function PrizeOrbit({ fx }: { fx: SpinFxState }) {
  const sparks = useMemo(() => {
    const r = rng(fx.id);
    return Array.from({ length: 18 }, () => ({ a: r() * 360, d: 0.55 + r() * 0.6, s: 3 + r() * 5 }));
  }, [fx.id]);

  return (
    <div className="absolute" style={{ left: fx.cx, top: fx.cy, width: 0, height: 0, perspective: 900 }}>
      <div style={{ transformStyle: "preserve-3d", transform: "rotateX(-16deg)" }}>
        <motion.div
          style={{ transformStyle: "preserve-3d" }}
          initial={{ rotateY: 0 }}
          animate={{ rotateY: 360 * 2.2 }}
          transition={{ duration: fx.seconds, ease: [0.12, 0.7, 0.1, 1] }}
        >
          {PRIZES.map((p, i) => (
            <div
              key={p.label}
              className="absolute flex flex-col items-center justify-center rounded-xl text-center"
              style={{
                width: 104,
                height: 64,
                left: -52,
                top: -32,
                backfaceVisibility: "hidden",
                transform: `rotateY(${i * (360 / PRIZES.length)}deg) translateZ(min(40vw, 160px))`,
                background: p.jackpot
                  ? "linear-gradient(135deg, rgba(255,240,170,0.95), rgba(226,180,62,0.9))"
                  : "linear-gradient(135deg, rgba(20,30,90,0.82), rgba(10,16,52,0.78))",
                border: "1.5px solid #f3d98b",
                boxShadow: p.jackpot ? "0 0 26px 6px rgba(255,210,80,0.8)" : GOLD_BLUE_GLOW,
                color: p.jackpot ? "#2a1400" : "#fff1c2",
                backdropFilter: "blur(2px)",
              }}
            >
              <span className="font-tarot text-xl font-bold leading-none" style={{ textShadow: p.jackpot ? "none" : "0 0 10px #ffd35a" }}>
                {p.label}
              </span>
              <span className="mt-0.5 text-[10px] leading-none opacity-90">{p.sub}</span>
            </div>
          ))}
          {sparks.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                width: s.s,
                height: s.s,
                left: -s.s / 2,
                top: -s.s / 2,
                background: "#ffe08a",
                boxShadow: "0 0 8px 2px #ffc43a",
                transform: `rotateY(${s.a}deg) translateZ(calc(min(40vw, 160px) * ${s.d})) translateY(${(i % 5) * 14 - 28}px)`,
              }}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/* ───────────────────────── 4. the Grim Reaper lunges at the screen ───────────────────────── */

const RUNE_STROKES = [
  "M0 -10 V10 M0 -4 L6 -10 M0 2 L6 -4",
  "M0 -10 V10 M0 -10 L6 -4 L0 2",
  "M0 -10 V10 M-5 -5 L5 5 M5 -5 L-5 5",
  "M0 -10 V10 M0 -10 L6 -5 M0 -1 L6 4",
  "M-4 -10 L4 0 L-4 10 M4 -10 L-4 0 L4 10",
  "M0 -10 L6 0 L0 10 L-6 0 Z",
];

/**
 * Timeline (seconds, spin = `fx.seconds`): swell → IMPACT at REAPER_IMPACT_S (single flash, 0.15s lunge,
 * screen shake) → looming → dissolve into mist so it is gone when the wheel stops.
 * Only ONE bright flash (no strobing). Not rendered at all when the user prefers reduced motion.
 */
function GrimReaper({ fx }: { fx: SpinFxState }) {
  const T = Math.max(1.5, fx.seconds);
  const a = Math.min(REAPER_IMPACT_S, T * 0.3) / T; // impact
  const b = a + 0.15 / T; // lunge finished
  const c = Math.max(b + 0.05, (T - 1.4) / T); // start of dissolve
  const times = [0, a, b, c, 1];
  // Per-property transitions: the figure pops into view almost instantly (opacity), lunges with an ease-out scale,
  // then sits until the dissolve starts.
  const popIn = Math.min(a + 0.05 / T, b);
  const rise: ReaperRise = {
    scale: { duration: T, times, ease: ["linear", "circOut", "linear", "easeIn"] satisfies Easing[] },
    opacity: { duration: T, times: [0, a, popIn, c, 1], ease: "linear" },
    filter: { duration: T, times: [0, a, b, c, 1], ease: "linear" },
  };

  // camera shake: the wheel (and the overlay's own content) jitter for ~0.6s at impact
  useEffect(() => {
    const el = document.querySelector("[data-wheel-box]");
    const on = window.setTimeout(() => el?.classList.add("reaper-shake"), a * T * 1000);
    const off = window.setTimeout(() => el?.classList.remove("reaper-shake"), a * T * 1000 + 700);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
      el?.classList.remove("reaper-shake");
    };
  }, [a, T]);

  const runes = useMemo(() => {
    const r = rng(fx.id);
    return Array.from({ length: 18 }, (_, i) => ({ a: i * 20, d: RUNE_STROKES[Math.floor(r() * RUNE_STROKES.length)] }));
  }, [fx.id]);

  const slashes = useMemo(() => {
    const r = rng(fx.id + 5);
    return Array.from({ length: 7 }, (_, i) => ({
      top: 8 + r() * 84,
      rot: (r() > 0.5 ? 1 : -1) * (14 + r() * 30),
      delay: a * T + 0.05 + i * 0.045,
      gold: i % 2 === 0,
    }));
  }, [fx.id, a, T]);

  return (
    <div className="absolute inset-0">
      {/* darkness that closes in, and dissolves with the figure */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(40,0,10,0.55) 0%, rgba(4,0,8,0.93) 70%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{ duration: T, times, ease: "linear" }}
      />

      {/* dark vortex: swirling smoke behind the figure */}
      <motion.div
        className="absolute left-1/2 top-1/2 aspect-square w-[190vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0 8%, rgba(70,0,25,0.7) 14%, transparent 24% 40%, rgba(25,0,45,0.75) 48%, transparent 58% 72%, rgba(90,10,10,0.6) 80%, transparent 92%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 3%, #000 12%, #000 38%, transparent 62%)",
          maskImage: "radial-gradient(circle, transparent 3%, #000 12%, #000 38%, transparent 62%)",
        }}
        initial={{ opacity: 0, rotate: 0 }}
        animate={{ opacity: [0, 0, 0.9, 0.9, 0], rotate: -360 }}
        transition={{ opacity: { duration: T, times, ease: "linear" }, rotate: { duration: 7, ease: "linear", repeat: Infinity } }}
      />

      {/* the figure — shaken as a whole at impact */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="reaper-shake-once flex h-full w-full items-center justify-center" style={{ animationDelay: `${a * T}s` }}>
          {/* CSS 3D stage: smoke/embers (z −170) · figure (z 0) · scythe (z +150) lunge out at different rates */}
          <div className="flex h-full w-full items-center justify-center" style={{ perspective: "900px", perspectiveOrigin: "50% 42%" }}>
            <motion.div
              className="relative h-[min(104vh,168vw)] max-w-none"
              style={{ aspectRatio: "400 / 700", transformOrigin: "50% 40%", transformStyle: "preserve-3d" }}
              initial={{ scale: 0.2, rotateX: 8, rotateY: -10 }}
              animate={{
                scale: [0.2, 0.2, 1.15, 1.06, 1.0],
                rotateX: [8, 8, 0, -1, 0],
                rotateY: [-10, -10, 0, 3, -2],
              }}
              transition={{ scale: rise.scale, rotateX: { duration: T, times, ease: "linear" }, rotateY: { duration: T, times, ease: "linear" } }}
            >
              <ReaperLayer z={-170} className="absolute -inset-[45%]" rise={rise}>
                <ReaperBackdrop seed={fx.id} />
              </ReaperLayer>
              <ReaperLayer z={0} className="absolute inset-0" rise={rise}>
                <ReaperFigure />
              </ReaperLayer>
              <ReaperLayer z={100} className="absolute inset-0" rise={rise}>
                <ReaperScythe runes={runes} />
              </ReaperLayer>
            </motion.div>
          </div>
        </div>
      </div>

      {/* heavy abyssal vignette closes the screen edges */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 70% 62% at 50% 45%, transparent 40%, rgba(2,0,6,0.78) 78%, #000 100%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{ duration: T, times, ease: "linear" }}
      />

      {/* crimson-gold energy slashes at the instant of impact */}
      {slashes.map((sl, i) => (
        <motion.div
          key={i}
          className="absolute left-[-20%] h-[3px] w-[140%]"
          style={{
            top: `${sl.top}%`,
            rotate: sl.rot,
            background: sl.gold
              ? "linear-gradient(90deg, transparent, #ffe08a 30%, #fff6cf 50%, #ffc43a 70%, transparent)"
              : "linear-gradient(90deg, transparent, #ff2a3a 30%, #ff9aa0 50%, #c4121f 70%, transparent)",
            boxShadow: sl.gold ? "0 0 18px 3px rgba(255,200,60,0.8)" : "0 0 18px 3px rgba(255,40,60,0.8)",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 0.45, delay: sl.delay, ease: "easeOut" }}
        />
      ))}

      {/* ONE brief crimson-white flash + lightning at impact (never repeated) */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 40%, #fff 0%, #ff4458 30%, #5a0010 80%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.85, 0.25, 0] }}
        transition={{ duration: T, times: [0, a, a + 0.04 / T, a + 0.14 / T, a + 0.45 / T], ease: "linear" }}
      />
      <motion.svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 0, 0] }}
        transition={{ duration: T, times: [0, a, a + 0.03 / T, a + 0.22 / T, 1], ease: "linear" }}
      >
        <path d="M30 0 L38 22 L30 24 L44 52 L36 54 L50 100" fill="none" stroke="#fff" strokeWidth="0.9" strokeLinejoin="miter" style={{ filter: "drop-shadow(0 0 3px #ff6070)" }} />
        <path d="M72 0 L66 18 L74 20 L62 46 L68 48 L58 80" fill="none" stroke="#ffd9dd" strokeWidth="0.6" style={{ filter: "drop-shadow(0 0 3px #ff6070)" }} />
      </motion.svg>
    </div>
  );
}

type ReaperRise = { scale: Transition; opacity: Transition; filter: Transition };

/** One depth plane of the 3D stage: same fade-in / mist dissolve as the old flat figure, own translateZ. */
function ReaperLayer({ z, className, rise, children }: { z: number; className: string; rise: ReaperRise; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      style={{ z }}
      initial={{ opacity: 0, filter: "blur(12px)" }}
      animate={{
        opacity: [0, 0, 1, 1, 0],
        filter: ["blur(12px)", "blur(12px)", "blur(0px)", "blur(0px)", "blur(16px)"],
      }}
      transition={{ opacity: rise.opacity, filter: rise.filter }}
    >
      {children}
    </motion.div>
  );
}

/** Background plane: volumetric smoke banks + glowing embers rising (pure CSS, GPU transforms). */
function ReaperBackdrop({ seed }: { seed: number }) {
  const smoke = [
    { l: 6, t: 52, w: 52, c: "rgba(80,0,28,0.6)", d: 0, s: 5.5 },
    { l: 52, t: 22, w: 56, c: "rgba(26,0,64,0.65)", d: -1.5, s: 6.5 },
    { l: 22, t: 70, w: 50, c: "rgba(120,16,10,0.45)", d: -3, s: 5 },
    { l: 58, t: 64, w: 46, c: "rgba(10,6,48,0.75)", d: -2, s: 7 },
    { l: 34, t: 36, w: 42, c: "rgba(46,0,22,0.65)", d: -4, s: 6 },
  ];
  const embers = useMemo(() => {
    const r = rng(seed + 11);
    return Array.from({ length: 26 }, (_, i) => ({
      l: 8 + r() * 84,
      t: 55 + r() * 42,
      size: 2 + r() * 4,
      dx: (r() - 0.5) * 120,
      dur: 2.6 + r() * 2.8,
      del: -r() * 4,
      gold: i % 3 !== 0,
    }));
  }, [seed]);
  return (
    <div className="absolute inset-0">
      {smoke.map((s, i) => (
        <div
          key={i}
          className="reaper-smoke absolute aspect-square rounded-full"
          style={{
            left: `${s.l}%`,
            top: `${s.t}%`,
            width: `${s.w}%`,
            background: `radial-gradient(circle, ${s.c} 0%, transparent 68%)`,
            animationDelay: `${s.d}s`,
            animationDuration: `${s.s}s`,
          }}
        />
      ))}
      {embers.map((e, i) => (
        <span
          key={i}
          className="reaper-ember absolute rounded-full"
          style={
            {
              left: `${e.l}%`,
              top: `${e.t}%`,
              width: e.size,
              height: e.size,
              background: e.gold ? "#ffd35a" : "#ff3a48",
              boxShadow: e.gold ? "0 0 8px 2px rgba(255,190,60,0.8)" : "0 0 8px 2px rgba(255,40,60,0.8)",
              "--dx": `${e.dx}px`,
              "--dur": `${e.dur}s`,
              "--del": `${e.del}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

const CLOAK_D =
  "M200 38 C120 52 88 130 76 215 C56 330 18 500 -10 705 L18 690 L40 712 L70 684 L100 714 L132 690 L164 716 L200 688 L236 716 L268 690 L300 714 L330 684 L360 712 L382 690 L410 705 C382 500 344 330 324 215 C312 130 280 52 200 38 Z";
const HOOD_D = "M200 52 C140 62 116 120 118 176 C120 226 152 262 200 268 C248 262 280 226 282 176 C284 120 260 62 200 52 Z";
const PAULDRON_D = "M96 200 C78 156 112 104 172 112 C156 140 142 184 146 240 C122 240 102 226 96 200 Z";

/** Midground: sculpted hooded cloak, tattered pauldrons, skull in the void, molten eyes — rim-lit crimson-gold left, abyssal violet right. */
function ReaperFigure() {
  return (
    <svg viewBox="0 0 400 700" className="size-full" preserveAspectRatio="xMidYMid slice" role="presentation">
      <defs>
        <linearGradient id="m-cloak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#242030" />
          <stop offset="0.45" stopColor="#0f0d16" />
          <stop offset="1" stopColor="#020106" />
        </linearGradient>
        {/* rim light: warm from the left, cold from the right */}
        <linearGradient id="m-rim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.95" />
          <stop offset="0.14" stopColor="#c4121f" stopOpacity="0.35" />
          <stop offset="0.3" stopColor="#c4121f" stopOpacity="0" />
          <stop offset="0.7" stopColor="#3a2cff" stopOpacity="0" />
          <stop offset="0.88" stopColor="#5a48ff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#7a6cff" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="m-rimL" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd98a" />
          <stop offset="0.5" stopColor="#e0531f" />
          <stop offset="1" stopColor="#6b0f22" />
        </linearGradient>
        <linearGradient id="m-rimR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a8cff" />
          <stop offset="0.5" stopColor="#4a3cff" />
          <stop offset="1" stopColor="#12083a" />
        </linearGradient>
        <linearGradient id="m-fold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.75" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0.15" />
          <stop offset="1" stopColor="#6a5a9a" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="m-armor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6a6272" />
          <stop offset="0.35" stopColor="#25222d" />
          <stop offset="0.7" stopColor="#0c0b11" />
          <stop offset="1" stopColor="#3a3350" />
        </linearGradient>
        <radialGradient id="m-hood" cx="0.34" cy="0.22" r="0.85">
          <stop offset="0" stopColor="#3a3446" />
          <stop offset="0.5" stopColor="#14111b" />
          <stop offset="1" stopColor="#050409" />
        </radialGradient>
        <radialGradient id="m-void" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#0a0509" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <radialGradient id="m-bone" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6a6070" stopOpacity="0.7" />
          <stop offset="1" stopColor="#6a6070" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="m-eye" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff8d8" />
          <stop offset="0.22" stopColor="#ffc93a" />
          <stop offset="0.55" stopColor="#ff2438" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ff0a20" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="m-flare" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff4458" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff0b0" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff4458" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="m-aura" cx="0.5" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#ff1a30" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff1a30" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="m-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1030" stopOpacity="0" />
          <stop offset="1" stopColor="#2a1040" stopOpacity="0.85" />
        </linearGradient>
        <clipPath id="m-cloak-clip">
          <path d={CLOAK_D} />
        </clipPath>
        <clipPath id="m-left">
          <rect x="0" y="0" width="200" height="700" />
        </clipPath>
        <clipPath id="m-right">
          <rect x="200" y="0" width="200" height="700" />
        </clipPath>
        <path id="m-pauld" d={PAULDRON_D} />
      </defs>

      <ellipse cx="200" cy="190" rx="270" ry="250" fill="url(#m-aura)" />

      {/* cloak body with sculpted folds + rim light */}
      <path d={CLOAK_D} fill="url(#m-cloak)" />
      <g clipPath="url(#m-cloak-clip)">
        <path d="M150 230 C128 400 108 560 82 700 L134 700 C146 560 166 400 184 250 Z" fill="url(#m-fold)" />
        <path d="M236 240 C250 400 270 560 296 700 L340 700 C318 560 292 400 272 230 Z" fill="url(#m-fold)" opacity="0.8" />
        <path d="M200 262 C190 420 196 560 204 700 L232 700 C226 560 222 420 222 262 Z" fill="#000" opacity="0.4" />
        <path d="M112 300 C100 420 70 560 40 700" fill="none" stroke="#6a5a8a" strokeOpacity="0.28" strokeWidth="2.5" />
        <path d="M290 300 C304 420 330 560 360 700" fill="none" stroke="#5a48ff" strokeOpacity="0.3" strokeWidth="2.5" />
        <rect width="400" height="700" fill="url(#m-rim)" />
        <rect y="470" width="400" height="240" fill="url(#m-mist)" />
      </g>
      <path d={CLOAK_D} fill="none" stroke="url(#m-rimL)" strokeWidth="2.6" clipPath="url(#m-left)" />
      <path d={CLOAK_D} fill="none" stroke="url(#m-rimR)" strokeWidth="2.6" clipPath="url(#m-right)" />

      {/* tattered pauldrons: layered plates, brushed-metal edge */}
      <use href="#m-pauld" fill="url(#m-armor)" stroke="url(#m-rimL)" strokeWidth="2.4" />
      <path d="M104 190 C120 160 140 140 164 130 M112 214 C128 184 146 164 160 156" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.4" />
      <path d="M98 214 L90 232 L106 226 L104 244" fill="none" stroke="#1a1520" strokeWidth="3" strokeLinecap="round" />
      <g transform="translate(400 0) scale(-1 1)">
        <use href="#m-pauld" fill="url(#m-armor)" stroke="url(#m-rimR)" strokeWidth="2.4" />
        <path d="M104 190 C120 160 140 140 164 130 M112 214 C128 184 146 164 160 156" fill="none" stroke="#9a8cff" strokeOpacity="0.22" strokeWidth="1.4" />
        <path d="M98 214 L90 232 L106 226 L104 244" fill="none" stroke="#1a1520" strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* hood */}
      <path d={HOOD_D} fill="url(#m-hood)" />
      <path d="M150 90 C134 116 130 150 134 190 M244 84 C264 112 272 150 268 192" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" />
      <path d={HOOD_D} fill="none" stroke="url(#m-rimL)" strokeWidth="3.4" clipPath="url(#m-left)" />
      <path d={HOOD_D} fill="none" stroke="url(#m-rimR)" strokeWidth="3.4" clipPath="url(#m-right)" />

      {/* the void within, with skeletal contours emerging from shadow */}
      <path d="M200 70 C152 78 134 124 136 172 C138 214 164 242 200 246 C236 242 262 214 264 172 C266 124 248 78 200 70 Z" fill="url(#m-void)" />
      <ellipse cx="160" cy="196" rx="22" ry="16" fill="url(#m-bone)" />
      <ellipse cx="240" cy="196" rx="22" ry="16" fill="url(#m-bone)" opacity="0.8" />
      <path d="M146 150 Q172 134 196 152 M254 150 Q228 134 204 152" fill="none" stroke="#7a6e82" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
      <path d="M200 172 L190 204 Q200 210 210 204 Z" fill="#000" stroke="#5a4e60" strokeOpacity="0.5" strokeWidth="1.2" />
      <path d="M166 226 Q200 236 234 226 M174 226 V240 M186 228 V243 M200 229 V244 M214 228 V243 M226 226 V240" stroke="#8a7e8c" strokeOpacity="0.45" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* molten gold–crimson eyes with volumetric flares */}
      <g className="reaper-eyes">
        <ellipse cx="170" cy="162" rx="40" ry="26" fill="url(#m-eye)" />
        <ellipse cx="230" cy="162" rx="40" ry="26" fill="url(#m-eye)" />
        <path d="M154 160 Q170 148 188 164 Q170 172 154 160 Z" fill="#ffb03a" />
        <path d="M246 160 Q230 148 212 164 Q230 172 246 160 Z" fill="#ffb03a" />
        <circle cx="172" cy="161" r="3.4" fill="#fff" />
        <circle cx="228" cy="161" r="3.4" fill="#fff" />
        <ellipse cx="170" cy="162" rx="92" ry="3" fill="url(#m-flare)" />
        <ellipse cx="230" cy="162" rx="92" ry="3" fill="url(#m-flare)" />
        <ellipse cx="170" cy="162" rx="3" ry="44" fill="url(#m-flare)" opacity="0.6" />
        <ellipse cx="230" cy="162" rx="3" ry="44" fill="url(#m-flare)" opacity="0.6" />
      </g>
    </svg>
  );
}

/** Foreground plane: forged dark-steel + antique-gold scythe with glowing runes and dripping crimson energy, gripped by skeletal hands. */
function ReaperScythe({ runes }: { runes: { a: number; d: string }[] }) {
  const bladeRunes = [
    { x: 200, y: 46 },
    { x: 165, y: 41 },
    { x: 130, y: 39 },
    { x: 100, y: 47 },
    { x: 74, y: 60 },
  ];
  const drips = [
    { x: 84, y: 78, del: 0 },
    { x: 132, y: 66, del: 0.45 },
    { x: 182, y: 66, del: 0.9 },
    { x: 226, y: 84, del: 0.2 },
  ];
  return (
    <svg viewBox="0 0 400 700" className="size-full overflow-visible" preserveAspectRatio="xMidYMid slice" role="presentation">
      <defs>
        <linearGradient id="s-steel" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#0c0e14" />
          <stop offset="0.3" stopColor="#7a8496" />
          <stop offset="0.45" stopColor="#1c2029" />
          <stop offset="0.75" stopColor="#4a5262" />
          <stop offset="1" stopColor="#0a0b10" />
        </linearGradient>
        <linearGradient id="s-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#ffd9dd" />
          <stop offset="1" stopColor="#ff2a3a" />
        </linearGradient>
        <linearGradient id="s-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset="0.35" stopColor="#d4a02e" />
          <stop offset="0.7" stopColor="#7a5414" />
          <stop offset="1" stopColor="#e8c05a" />
        </linearGradient>
        <linearGradient id="s-staff" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0a0a0e" />
          <stop offset="0.3" stopColor="#5a5f6e" />
          <stop offset="0.5" stopColor="#1a1c24" />
          <stop offset="1" stopColor="#050508" />
        </linearGradient>
        <linearGradient id="s-bone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efe6cc" />
          <stop offset="0.6" stopColor="#b8ae94" />
          <stop offset="1" stopColor="#5a5040" />
        </linearGradient>
        <radialGradient id="s-trail" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff2a3a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff2a3a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="translate(14 78) scale(0.94)">
      {/* crimson energy haze hugging the blade */}
      <ellipse cx="150" cy="84" rx="150" ry="46" fill="url(#s-trail)" />

      {/* staff: dark steel with gold bands */}
      <g transform="translate(372 715) rotate(-9.26)">
        <rect x="-7" y="-700" width="14" height="720" rx="5" fill="url(#s-staff)" />
        <rect x="-2" y="-700" width="1.6" height="720" fill="#fff" opacity="0.22" />
        {[-640, -420, -300, -120].map((y) => (
          <rect key={y} x="-8.5" y={y} width="17" height="9" rx="2.5" fill="url(#s-gold)" stroke="#3d2903" strokeWidth="0.8" />
        ))}
      </g>

      {/* blade: forged steel body */}
      <path d="M262 40 C190 -22 90 -10 34 96 C100 58 190 56 250 104 Z" fill="url(#s-steel)" />
      {/* brushed-metal streaks */}
      <path d="M240 50 C186 6 108 8 62 74 M244 62 C190 24 118 26 78 78 M246 76 C196 44 128 44 94 82" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="1" />
      {/* gold-trimmed spine */}
      <path d="M262 40 C190 -22 90 -10 34 96" fill="none" stroke="url(#s-gold)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M258 38 C190 -18 92 -8 40 88" fill="none" stroke="#fff6cf" strokeOpacity="0.7" strokeWidth="1.2" />
      {/* razor edge, white → crimson */}
      <path d="M34 96 C100 58 190 56 250 104" fill="none" stroke="#ff2a3a" strokeOpacity="0.5" strokeWidth="7" strokeLinecap="round" />
      <path d="M34 96 C100 58 190 56 250 104" fill="none" stroke="url(#s-edge)" strokeWidth="2.4" strokeLinecap="round" />
      {/* engraved glowing runes along the blade */}
      {bladeRunes.map((r, i) => (
        <g key={i} transform={`translate(${r.x} ${r.y}) scale(0.62)`}>
          <path
            className="reaper-glint"
            d={runes[i % runes.length].d}
            fill="none"
            stroke={i % 2 ? "#ffd35a" : "#ff6a3a"}
            strokeWidth="2.6"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 3px currentColor)", animationDelay: `${i * 0.18}s` }}
          />
        </g>
      ))}
      {/* dripping dark-crimson energy */}
      {drips.map((d, i) => (
        <ellipse key={i} className="reaper-drip" cx={d.x} cy={d.y} rx="2.6" ry="5.5" fill="#ff2a3a" style={{ ["--del" as string]: `${d.del}s` }} />
      ))}

      {/* ornate socket where blade meets staff */}
      <circle cx="262" cy="46" r="12" fill="url(#s-gold)" stroke="#3d2903" strokeWidth="2" />
      <circle cx="262" cy="46" r="5" fill="#c4121f" stroke="#fff0b0" strokeWidth="1" />
      <path d="M250 34 L244 24 M274 34 L280 24 M274 58 L282 66" stroke="url(#s-gold)" strokeWidth="3.5" strokeLinecap="round" />

      {/* skeletal hands gripping the staff */}
      {[
        { x: 322, y: 330 },
        { x: 336, y: 470 },
      ].map((h, i) => (
        <g key={i} transform={`translate(${h.x} ${h.y}) rotate(-9)`}>
          <rect x="-34" y="-8" width="40" height="16" rx="8" fill="url(#s-bone)" stroke="#2a2218" strokeWidth="1.5" />
          {[-12, -4, 4, 12].map((dy) => (
            <rect key={dy} x="-6" y={dy - 3} width="28" height="7" rx="3.5" fill="url(#s-bone)" stroke="#2a2218" strokeWidth="1" />
          ))}
          <path d="M-30 -4 H0 M-6 -15 V15" stroke="#fff" strokeOpacity="0.18" strokeWidth="1" />
        </g>
      ))}
      {/* tattered sleeve cuffs */}
      <path d="M288 300 L330 316 L322 348 L276 336 Z M300 446 L346 458 L338 492 L292 478 Z" fill="#0c0a12" stroke="#c4121f" strokeOpacity="0.6" strokeWidth="1.6" />
      </g>
    </svg>
  );
}
