"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  animate,
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";
import { WHEEL_SEGMENTS, type WheelSegment } from "@/lib/wheel/segments";

/**
 * Fairytale golden wheel: layered SVG (no 3D library). Everything that moves does so via a
 * motion value, a CSS keyframe or one rAF loop — no SVG filters on rotating content.
 *
 *   viewBox 480×480, centre (240,240): flames r≈200–240 · rim r≈176–205 · disc r=168 · hub · pointer
 */
const C = 240;
const R = 168; // disc radius
const N = WHEEL_SEGMENTS.length;
const STEP = 360 / N;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  // Rounded: Math.sin/cos can differ in the last digits between Node (SSR) and the browser → hydration mismatch.
  return { x: round4(C + r * Math.sin(a)), y: round4(C - r * Math.cos(a)) };
};

function slicePath(i: number) {
  const p0 = polar(R, i * STEP - STEP / 2);
  const p1 = polar(R, i * STEP + STEP / 2);
  return `M${C} ${C} L${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

/** Tiny deterministic PRNG so server and client render identical sparkles. */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const FILL: Record<WheelSegment["tone"], string> = {
  navy: "url(#fw-sapphire)",
  dark: "url(#fw-velvet)",
  dim: "url(#fw-obsidian)",
  gold: "url(#fw-brushed)",
  jackpot: "url(#fw-radiant)",
};
const TEXT: Record<WheelSegment["tone"], { fill: string; stroke: string }> = {
  navy: { fill: "#fff1c2", stroke: "#050a22" },
  dark: { fill: "#fff1c2", stroke: "#0a0620" },
  dim: { fill: "#c9b98a", stroke: "#05040a" },
  gold: { fill: "#2a1a02", stroke: "#fff0b8" },
  jackpot: { fill: "#2a1400", stroke: "#fff8d6" },
};

const FLAME_OUT = "M-10 0 C-13 -11 -5 -17 -3 -25 C-2 -30 0 -33 1 -40 C6 -31 13 -15 10 0 Z";
const FLAME_IN = "M-5 0 C-7 -7 -2 -11 -1 -16 C0 -20 0 -22 1 -26 C4 -19 7 -9 5 0 Z";

type Props = {
  /** Target disc rotation in degrees (cumulative, clockwise). Changing it starts a spin. */
  rotation: number;
  seconds: number;
  spinning: boolean;
  onComplete: () => void;
  /** Segment key to light up (the luck-card buff highlights the 500-coin slice). Opacity/stroke only — no SVG filters on rotating content. */
  highlightKey?: string;
};

export function FantasyWheel({ rotation, seconds, spinning, onComplete, highlightKey }: Props) {
  const reduce = useReducedMotion();
  const disc = useMotionValue(0);
  const pointer = useMotionValue(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // — spin
  useEffect(() => {
    const spinDuration = Math.max(0.5, Math.min(seconds, 2.2));
    const controls = animate(disc, rotation, {
      duration: spinDuration,
      ease: [0.14, 0.88, 0.24, 1],
      onComplete: () => onCompleteRef.current(),
    });
    return () => controls.stop();
  }, [rotation, seconds, disc]);

  // ── pointer ticks each time a peg passes the top ───────────────────────
  const lastPeg = useRef(0);
  useMotionValueEvent(disc, "change", (v) => {
    const peg = Math.floor((v + STEP / 2) / STEP);
    if (peg !== lastPeg.current) {
      lastPeg.current = peg;
      if (!reduce) {
        pointer.set(-15);
        animate(pointer, 0, { type: "spring", stiffness: 520, damping: 13 });
      }
    }
  });

  // ── flame rings: one rAF loop, speed eases between idle and spinning ───
  const rootRef = useRef<SVGSVGElement>(null);
  const offscreen = useRef(false);
  // scrolled out of view: pause the CSS loops (via data-offscreen) and the rAF flame loop below, unless a spin is running
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      offscreen.current = !entry.isIntersecting;
      el.dataset.offscreen = String(!entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // while the page is being scrolled: pause every loop (CSS via html[data-scrolling]) and the rAF flame loop, resume 140 ms after the last scroll event
  const scrolling = useRef(false);
  useEffect(() => {
    const html = document.documentElement;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (!scrolling.current) {
        scrolling.current = true;
        html.dataset.scrolling = "true";
      }
      clearTimeout(t);
      t = setTimeout(() => {
        scrolling.current = false;
        delete html.dataset.scrolling;
      }, 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t);
      delete html.dataset.scrolling;
    };
  }, []);
  const fireA = useRef<SVGGElement>(null);
  const fireB = useRef<SVGGElement>(null);
  const angle = useRef(0);
  const speed = useRef(10);
  useAnimationFrame((_, delta) => {
    if (reduce || ((offscreen.current || scrolling.current) && !spinning)) return;
    const target = spinning ? 330 : 10; // degrees / second
    speed.current += (target - speed.current) * Math.min(1, (delta / 1000) * (spinning ? 2.2 : 1.2));
    angle.current = (angle.current + (speed.current * delta) / 1000) % 360;
    fireA.current?.setAttribute("transform", `rotate(${angle.current.toFixed(2)} ${C} ${C})`);
    fireB.current?.setAttribute("transform", `rotate(${(-angle.current * 0.7).toFixed(2)} ${C} ${C})`);
  });

  // ── static decoration (computed once) ──────────────────────────────────
  const flamesA = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const r = rng(i + 3);
        return { a: i * 22.5, s: 0.95 + r() * 0.55, d: -r() * 1.2, dur: 0.55 + r() * 0.5 };
      }),
    [],
  );
  const flamesB = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => {
        const r = rng(i + 91);
        return { a: i * 18 + 4, s: 0.55 + r() * 0.4, d: -r() * 1.2, dur: 0.4 + r() * 0.4 };
      }),
    [],
  );
  const embers = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const r = rng(i + 400);
        const p = polar(206 + r() * 24, r() * 360);
        return { x: p.x, y: p.y, r: 1 + r() * 2, d: -r() * 4, dur: 2.2 + r() * 2.6, big: r() > 0.7 };
      }),
    [],
  );
  const sparkles = useMemo(
    () =>
      WHEEL_SEGMENTS.map((_, i) => {
        const r = rng(i * 17 + 5);
        return Array.from({ length: 9 }, () => {
          const p = polar(48 + r() * 108, i * STEP + (r() - 0.5) * (STEP - 10));
          return { ...p, s: 0.7 + r() * 1.5, o: 0.3 + r() * 0.6 };
        });
      }),
    [],
  );

  return (
    <svg
      ref={rootRef}
      viewBox="0 0 480 480"
      className="fw-root mx-auto block w-full"
      data-spinning={spinning}
      role="img"
      aria-label="กงล้อมหาเฮง"
      overflow="visible"
    >
      <defs>
        {/* flames */}
        <linearGradient id="fw-flame-out" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d9620a" />
          <stop offset="0.4" stopColor="#ffa91f" />
          <stop offset="1" stopColor="#ffe9a3" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id="fw-flame-in" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffc94a" />
          <stop offset="0.6" stopColor="#fff0b8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id="fw-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.68" stopColor="#ff9d1a" stopOpacity="0" />
          <stop offset="0.82" stopColor="#ffb52e" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff8a00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fw-streak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff6d0" stopOpacity="0" />
          <stop offset="1" stopColor="#fff6d0" />
        </linearGradient>

        {/* rim */}
        <linearGradient id="fw-rim" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#fff3bd" />
          <stop offset="0.25" stopColor="#e9bb45" />
          <stop offset="0.55" stopColor="#8d6612" />
          <stop offset="0.8" stopColor="#e2b43e" />
          <stop offset="1" stopColor="#6c4a0a" />
        </linearGradient>
        <linearGradient id="fw-rim-in" x1="0.9" y1="1" x2="0.1" y2="0">
          <stop offset="0" stopColor="#fbe8a0" />
          <stop offset="0.5" stopColor="#9a7118" />
          <stop offset="1" stopColor="#5c3f08" />
        </linearGradient>
        <radialGradient id="fw-gem-amber" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.45" stopColor="#ffb21e" />
          <stop offset="1" stopColor="#9a4a05" />
        </radialGradient>
        <radialGradient id="fw-gem-blue" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#e4f2ff" />
          <stop offset="0.45" stopColor="#4a86ff" />
          <stop offset="1" stopColor="#0d1f78" />
        </radialGradient>

        {/* segments (radial from the hub so they look the same however the disc is turned) */}
        <radialGradient id="fw-sapphire" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <stop offset="0" stopColor="#0c1c5c" />
          <stop offset="0.55" stopColor="#1d3a9a" />
          <stop offset="1" stopColor="#0a1450" />
        </radialGradient>
        <radialGradient id="fw-velvet" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <stop offset="0" stopColor="#120c36" />
          <stop offset="0.6" stopColor="#2a1c66" />
          <stop offset="1" stopColor="#0d0827" />
        </radialGradient>
        <radialGradient id="fw-obsidian" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <stop offset="0" stopColor="#0a0810" />
          <stop offset="0.6" stopColor="#1c1730" />
          <stop offset="1" stopColor="#09070f" />
        </radialGradient>
        <radialGradient id="fw-brushed" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <stop offset="0" stopColor="#7a560c" />
          <stop offset="0.5" stopColor="#d9a93a" />
          <stop offset="0.8" stopColor="#f6dc8a" />
          <stop offset="1" stopColor="#b98a22" />
        </radialGradient>
        <radialGradient id="fw-radiant" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <stop offset="0" stopColor="#c98f1a" />
          <stop offset="0.45" stopColor="#ffe08a" />
          <stop offset="0.8" stopColor="#fff7d0" />
          <stop offset="1" stopColor="#f0c04a" />
        </radialGradient>
        {/* recessed look: darken toward the hub and the rim */}
        <radialGradient id="fw-depth" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.82" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.42" />
        </radialGradient>
        {WHEEL_SEGMENTS.map((_, i) => (
          <clipPath key={i} id={`fw-clip-${i}`}>
            <path d={slicePath(i)} />
          </clipPath>
        ))}

        {/* hub + pointer */}
        <radialGradient id="fw-hub" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#fff7cf" />
          <stop offset="0.45" stopColor="#e2b43e" />
          <stop offset="1" stopColor="#6c4a0a" />
        </radialGradient>
        <radialGradient id="fw-core" cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#d6ecff" />
          <stop offset="0.4" stopColor="#4a86ff" />
          <stop offset="1" stopColor="#0a1a66" />
        </radialGradient>
        <radialGradient id="fw-core-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.4" stopColor="#7db2ff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#7db2ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fw-pointer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3bd" />
          <stop offset="0.5" stopColor="#e2b43e" />
          <stop offset="1" stopColor="#7a560c" />
        </linearGradient>
        <radialGradient id="fw-ruby" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffd9de" />
          <stop offset="0.45" stopColor="#e0243a" />
          <stop offset="1" stopColor="#5c0614" />
        </radialGradient>
      </defs>

      {/* ───────── blazing golden flames ───────── */}
      <circle cx={C} cy={C} r={236} fill="url(#fw-aura)" className="fw-aura" />

      <g ref={fireB}>
        {flamesB.map((f, i) => (
          <g key={i} transform={`rotate(${f.a} ${C} ${C}) translate(${C} ${C - 202})`}>
            <g
              className="fw-flame fw-flame-b"
              style={{ animationDelay: `${f.d}s`, animationDuration: `${f.dur}s` }}
            >
              <path d={FLAME_OUT} transform={`scale(${f.s})`} fill="url(#fw-flame-out)" opacity="0.8" />
            </g>
          </g>
        ))}
      </g>
      <g ref={fireA}>
        {flamesA.map((f, i) => (
          <g key={i} transform={`rotate(${f.a} ${C} ${C}) translate(${C} ${C - 201})`}>
            <g
              className="fw-flame"
              style={{ animationDelay: `${f.d}s`, animationDuration: `${f.dur}s` }}
            >
              <path d={FLAME_OUT} transform={`scale(${f.s * 1.15})`} fill="url(#fw-flame-out)" />
              <path d={FLAME_IN} transform={`scale(${f.s * 1.15})`} fill="url(#fw-flame-in)" />
            </g>
          </g>
        ))}
        {/* speed streaks: only visible while spinning */}
        <g className="fw-streaks" fill="none" strokeLinecap="round">
          {[0, 120, 240].map((a) => (
            <g key={a} transform={`rotate(${a} ${C} ${C})`}>
              <circle cx={C} cy={C} r={214} stroke="url(#fw-streak)" strokeWidth={5} strokeDasharray="120 1224" opacity="0.9" />
              <circle cx={C} cy={C} r={222} stroke="#ffb52e" strokeWidth={2.5} strokeDasharray="70 1325" opacity="0.8" />
            </g>
          ))}
        </g>
      </g>

      {/* ───────── ornate 3D rim ───────── */}
      <circle cx={C} cy={C} r={207} fill="#241703" />
      <circle cx={C} cy={C} r={205} fill="url(#fw-rim)" />
      <circle cx={C} cy={C} r={199} fill="none" stroke="#fff6cf" strokeOpacity="0.45" strokeWidth={1.2} />
      <circle cx={C} cy={C} r={183.5} fill="none" stroke="#3a2704" strokeOpacity="0.6" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={178} fill="url(#fw-rim-in)" />
      <circle cx={C} cy={C} r={175} fill="#07060c" />
      {/* specular sweep (top-left) and shade (bottom-right) */}
      <path
        d={`M${polar(201, -150).x} ${polar(201, -150).y} A201 201 0 0 1 ${polar(201, -40).x} ${polar(201, -40).y}`}
        fill="none"
        stroke="#fff"
        strokeOpacity="0.6"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <path
        d={`M${polar(181, 40).x} ${polar(181, 40).y} A181 181 0 0 1 ${polar(181, 150).x} ${polar(181, 150).y}`}
        fill="none"
        stroke="#000"
        strokeOpacity="0.45"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* gem studs + embossed four-point stars */}
      {Array.from({ length: 16 }, (_, i) => {
        const g = polar(191, i * 22.5);
        const s = polar(191, i * 22.5 + 11.25);
        const blue = i % 2 === 1;
        return (
          <g key={i}>
            <circle cx={g.x} cy={g.y} r={9} fill={blue ? "#4a86ff" : "#ffb21e"} opacity="0.35" className="fw-gem-glow" style={{ animationDelay: `${(i % 4) * 0.35}s` }} />
            <circle cx={g.x} cy={g.y} r={6.2} fill="#5b3d06" />
            <circle cx={g.x} cy={g.y} r={5} fill={blue ? "url(#fw-gem-blue)" : "url(#fw-gem-amber)"} />
            <circle cx={g.x - 1.6} cy={g.y - 1.8} r={1.4} fill="#fff" opacity="0.9" />
            <g transform={`translate(${s.x} ${s.y}) rotate(${i * 22.5 + 11.25})`}>
              <path d="M0 -5.5 L1.5 -1.5 L5.5 0 L1.5 1.5 L0 5.5 L-1.5 1.5 L-5.5 0 L-1.5 -1.5 Z" fill="#4a3205" transform="translate(0.8 0.9)" opacity="0.7" />
              <path d="M0 -5.5 L1.5 -1.5 L5.5 0 L1.5 1.5 L0 5.5 L-1.5 1.5 L-5.5 0 L-1.5 -1.5 Z" fill="#fff0b0" />
            </g>
          </g>
        );
      })}

      {/* ───────── rotating disc ───────── */}
      <motion.g
        data-testid="wheel-disc"
        data-rotation={rotation}
        // Framer gives SVG elements transform-box: fill-box, so origins are relative to the element's own
        // bounding box, NOT the viewBox. The disc is a full circle centred on (C,C), so its box centre is
        // the wheel's axis: 50% 50%. (Pixel origins like "240px" would orbit around the wrong point.)
        style={{ rotate: disc, originX: "50%", originY: "50%" }}
      >
        <circle cx={C} cy={C} r={R + 2} fill="#07060c" />
        {WHEEL_SEGMENTS.map((s, i) => {
          const t = TEXT[s.tone];
          return (
            <g key={s.key}>
              <path d={slicePath(i)} fill={FILL[s.tone]} />
              <path d={slicePath(i)} fill="url(#fw-depth)" />
              {/* cosmic shimmer */}
              {s.tone !== "dim" &&
                sparkles[i].map((p, k) => (
                  <circle key={k} cx={p.x} cy={p.y} r={p.s} fill="#fff" opacity={s.tone === "gold" ? p.o * 0.6 : p.o} />
                ))}
              {/* inner bevel: dark lip inside the edge, bright lip on it */}
              <g clipPath={`url(#fw-clip-${i})`}>
                <path d={slicePath(i)} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth={7} />
              </g>
              <path d={slicePath(i)} fill="none" stroke="#f3d98b" strokeOpacity="0.9" strokeWidth={1.4} />
              {/* luck-card buff: pulsing bright rim + soft glow on the highlighted slice */}
              {highlightKey === s.key && (
                <>
                  <path d={slicePath(i)} fill="#fff3b8" className="fw-buff-glow" />
                  <path d={slicePath(i)} fill="none" stroke="#fff6c8" strokeWidth={4.5} className="fw-buff-rim" />
                </>
              )}
              <g transform={`rotate(${i * STEP} ${C} ${C})`}>
                <text
                  x={C}
                  y={C - 114}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={t.fill}
                  stroke={t.stroke}
                  strokeWidth={3.5}
                  strokeOpacity={0.55}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                  fontSize={s.type === "coins" ? (s.value >= 1000 ? 30 : 34) : 18}
                  fontWeight={700}
                  className={s.type === "coins" ? "font-tarot" : "font-sans"}
                >
                  {s.short}
                </text>
                {s.type === "coins" && (
                  <text
                    x={C}
                    y={C - 82}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={t.fill}
                    stroke={t.stroke}
                    strokeWidth={3}
                    strokeOpacity={0.5}
                    paintOrder="stroke"
                    fontSize={14}
                    fontWeight={600}
                    className="font-sans"
                  >
                    เหรียญ
                  </text>
                )}
              </g>
            </g>
          );
        })}
        {/* pegs between slices */}
        {Array.from({ length: N }, (_, i) => {
          const p = polar(R - 4, i * STEP + STEP / 2);
          return (
            <g key={i}>
              <circle cx={p.x + 1} cy={p.y + 1.5} r={5} fill="#000" opacity="0.5" />
              <circle cx={p.x} cy={p.y} r={4.6} fill="url(#fw-hub)" stroke="#4a3205" strokeWidth={0.8} />
              <circle cx={p.x - 1.2} cy={p.y - 1.3} r={1.2} fill="#fff" opacity="0.85" />
            </g>
          );
        })}
      </motion.g>

      {/* ───────── 3D medallion hub (static) ───────── */}
      <g>
        {Array.from({ length: 16 }, (_, i) => (
          <path
            key={i}
            d={i % 2 === 0 ? "M0 -60 L8 -40 L-8 -40 Z" : "M0 -50 L6 -38 L-6 -38 Z"}
            transform={`translate(${C} ${C}) rotate(${i * 22.5})`}
            fill="url(#fw-hub)"
            stroke="#4a3205"
            strokeWidth={1}
          />
        ))}
        <circle cx={C} cy={C + 3} r={46} fill="#000" opacity="0.4" />
        <circle cx={C} cy={C} r={45} fill="url(#fw-hub)" stroke="#3d2903" strokeWidth={2.5} />
        <circle cx={C} cy={C} r={37} fill="url(#fw-rim-in)" />
        <circle cx={C} cy={C} r={32} fill="url(#fw-hub)" stroke="#5b3d06" strokeWidth={1.5} />
        <circle cx={C} cy={C} r={26} fill="url(#fw-core-glow)" className="fw-core-glow" />
        <circle cx={C} cy={C} r={19} fill="#0a1450" stroke="#f3d98b" strokeWidth={2} />
        <circle cx={C} cy={C} r={16.5} fill="url(#fw-core)" />
        <ellipse cx={C - 5} cy={C - 6} rx={6} ry={3.4} fill="#fff" opacity="0.75" transform={`rotate(-30 ${C - 5} ${C - 6})`} />
      </g>

      {/* ───────── golden crown pointer ───────── */}
      {/* pivot: horizontally centred, ~22px below the box top (fill-box, see above) */}
      <motion.g style={{ rotate: pointer, originX: "50%", originY: "24px" }}>
        <ellipse cx={C + 3} cy={52} rx={17} ry={7} fill="#000" opacity="0.35" />
        <path
          d="M222 8 L228 21 L240 4 L252 21 L258 8 L257 38 Q241 52 240 76 Q239 52 223 38 Z"
          fill="url(#fw-pointer)"
          stroke="#3d2903"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d="M240 4 L228 21 L222 8 L223 38 Q239 52 240 76 Z" fill="#fff" opacity="0.28" />
        <path d="M240 4 L252 21 L258 8 L257 38 Q241 52 240 76 Z" fill="#000" opacity="0.2" />
        <circle cx={C} cy={32} r={9} fill="#5b3d06" />
        <circle cx={C} cy={32} r={7.4} fill="url(#fw-ruby)" />
        <circle cx={C - 2.2} cy={29.5} r={1.9} fill="#fff" opacity="0.9" />
        <circle cx={C} cy={5} r={2.6} fill="#fff6c8" />
      </motion.g>

      {/* ───────── fairy-dust embers ───────── */}
      <g className="fw-embers" pointerEvents="none">
        {embers.map((e, i) => (
          <circle
            key={i}
            cx={e.x}
            cy={e.y}
            r={e.r}
            fill={e.big ? "#fff3c4" : "#ffc43a"}
            className="fw-ember"
            style={{ animationDelay: `${e.d}s`, animationDuration: `${e.dur}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
