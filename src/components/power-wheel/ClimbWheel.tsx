"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { SLICES } from "@/lib/power-wheel/config";

/**
 * The 10-slice wheel of วงล้อไต่ชั้น, drawn in the same visual language as the main golden wheel (FantasyWheel): bevelled gold rim with gem studs,
 * recessed velvet / sapphire / brushed-gold slices with cosmic sparkles, pegs, medallion hub, crown pointer, a breathing aura and fairy dust.
 * Danger slices are ruby-red with a 💀. Pure presentation: `danger` lists the danger slices of the CURRENT level (the odds are public),
 * `rotation` is the cumulative angle the parent wants (it already lands the server-chosen slice under the pointer).
 * CSS comes from globals.css (.fw-root / .fw-aura / .fw-ember / .fw-gem-glow / .fw-core-glow, which honour reduced motion).
 * Gradient ids are prefixed `cw-` so they never clash with the main wheel's `fw-` ones.
 */
const C = 240;
const R = 168;
const STEP = 360 / SLICES;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  // rounded: Math.sin/cos can differ in the last digits between Node (SSR) and the browser → hydration mismatch
  return { x: round4(C + r * Math.sin(a)), y: round4(C - r * Math.cos(a)) };
};
function slicePath(i: number) {
  const p0 = polar(R, i * STEP - STEP / 2);
  const p1 = polar(R, i * STEP + STEP / 2);
  return `M${C} ${C} L${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function ClimbWheel({
  danger,
  rotation,
  seconds,
  spinning,
  glow,
}: {
  danger: readonly number[];
  rotation: number;
  seconds: number;
  spinning: boolean;
  glow: "idle" | "win" | "lose";
}) {
  const embers = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const r = rng(i + 700);
        const p = polar(190 + r() * 40, r() * 360);
        return { x: p.x, y: p.y, r: 1 + r() * 2, d: -r() * 4, dur: 2.2 + r() * 2.6, big: r() > 0.7 };
      }),
    [],
  );
  const sparkles = useMemo(
    () =>
      Array.from({ length: SLICES }, (_, i) => {
        const r = rng(i * 17 + 9);
        return Array.from({ length: 8 }, () => {
          const p = polar(52 + r() * 104, i * STEP + (r() - 0.5) * (STEP - 8));
          return { ...p, s: 0.7 + r() * 1.4, o: 0.3 + r() * 0.6 };
        });
      }),
    [],
  );
  const dangerCount = danger.length;

  return (
    <div className="relative mx-auto w-full max-w-[21rem]" data-testid="climb-wheel" data-glow={glow}>
      <svg viewBox="0 0 480 480" className="fw-root mx-auto block w-full" data-spinning={spinning} role="img" aria-label={`วงล้อไต่ชั้น ${SLICES} ช่อง มีช่องอันตราย ${dangerCount} ช่อง`} overflow="visible">
        <defs>
          <radialGradient id="cw-aura" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.7" stopColor="#ff9d1a" stopOpacity="0" />
            <stop offset="0.84" stopColor="#ffb52e" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ff8a00" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cw-aura-lose" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.7" stopColor="#e0243a" stopOpacity="0" />
            <stop offset="0.86" stopColor="#ff3b55" stopOpacity="0.55" />
            <stop offset="1" stopColor="#a0102a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cw-rim" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#fff3bd" />
            <stop offset="0.25" stopColor="#e9bb45" />
            <stop offset="0.55" stopColor="#8d6612" />
            <stop offset="0.8" stopColor="#e2b43e" />
            <stop offset="1" stopColor="#6c4a0a" />
          </linearGradient>
          <linearGradient id="cw-rim-in" x1="0.9" y1="1" x2="0.1" y2="0">
            <stop offset="0" stopColor="#fbe8a0" />
            <stop offset="0.5" stopColor="#9a7118" />
            <stop offset="1" stopColor="#5c3f08" />
          </linearGradient>
          <radialGradient id="cw-gem-amber" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff6c8" />
            <stop offset="0.45" stopColor="#ffb21e" />
            <stop offset="1" stopColor="#9a4a05" />
          </radialGradient>
          <radialGradient id="cw-gem-violet" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#f1e4ff" />
            <stop offset="0.45" stopColor="#9a5cf0" />
            <stop offset="1" stopColor="#2b0d6e" />
          </radialGradient>
          <radialGradient id="cw-sapphire" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
            <stop offset="0" stopColor="#0c1c5c" />
            <stop offset="0.55" stopColor="#1d3a9a" />
            <stop offset="1" stopColor="#0a1450" />
          </radialGradient>
          <radialGradient id="cw-velvet" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
            <stop offset="0" stopColor="#120c36" />
            <stop offset="0.6" stopColor="#2a1c66" />
            <stop offset="1" stopColor="#0d0827" />
          </radialGradient>
          <radialGradient id="cw-ruby-slice" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
            <stop offset="0" stopColor="#3a0610" />
            <stop offset="0.55" stopColor="#8c1426" />
            <stop offset="1" stopColor="#4a0812" />
          </radialGradient>
          <radialGradient id="cw-depth" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={R}>
            <stop offset="0" stopColor="#000" stopOpacity="0.55" />
            <stop offset="0.3" stopColor="#000" stopOpacity="0" />
            <stop offset="0.82" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.42" />
          </radialGradient>
          {Array.from({ length: SLICES }, (_, i) => (
            <clipPath key={i} id={`cw-clip-${i}`}>
              <path d={slicePath(i)} />
            </clipPath>
          ))}
          <radialGradient id="cw-hub" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0" stopColor="#fff7cf" />
            <stop offset="0.45" stopColor="#e2b43e" />
            <stop offset="1" stopColor="#6c4a0a" />
          </radialGradient>
          <radialGradient id="cw-core" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#f1e4ff" />
            <stop offset="0.4" stopColor="#9a5cf0" />
            <stop offset="1" stopColor="#2b0d6e" />
          </radialGradient>
          <radialGradient id="cw-core-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.4" stopColor="#c9a0ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#c9a0ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cw-pointer" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff3bd" />
            <stop offset="0.5" stopColor="#e2b43e" />
            <stop offset="1" stopColor="#7a560c" />
          </linearGradient>
          <radialGradient id="cw-ruby" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffd9de" />
            <stop offset="0.45" stopColor="#e0243a" />
            <stop offset="1" stopColor="#5c0614" />
          </radialGradient>
        </defs>

        {/* breathing aura: golden, turns blood-red after a fall */}
        <circle cx={C} cy={C} r={236} fill={glow === "lose" ? "url(#cw-aura-lose)" : "url(#cw-aura)"} className="fw-aura" />
        {glow === "win" && <circle cx={C} cy={C} r={212} fill="none" stroke="#fff3b8" strokeWidth={3} strokeOpacity="0.8" className="fw-gem-glow" />}

        {/* ornate bevelled rim */}
        <circle cx={C} cy={C} r={207} fill="#241703" />
        <circle cx={C} cy={C} r={205} fill="url(#cw-rim)" />
        <circle cx={C} cy={C} r={199} fill="none" stroke="#fff6cf" strokeOpacity="0.45" strokeWidth={1.2} />
        <circle cx={C} cy={C} r={183.5} fill="none" stroke="#3a2704" strokeOpacity="0.6" strokeWidth={1.5} />
        <circle cx={C} cy={C} r={178} fill="url(#cw-rim-in)" />
        <circle cx={C} cy={C} r={175} fill="#07060c" />
        <path d={`M${polar(201, -150).x} ${polar(201, -150).y} A201 201 0 0 1 ${polar(201, -40).x} ${polar(201, -40).y}`} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth={2.5} strokeLinecap="round" />
        <path d={`M${polar(181, 40).x} ${polar(181, 40).y} A181 181 0 0 1 ${polar(181, 150).x} ${polar(181, 150).y}`} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth={3} strokeLinecap="round" />
        {Array.from({ length: 20 }, (_, i) => {
          const g = polar(191, i * 18);
          const violet = i % 2 === 1;
          return (
            <g key={i}>
              <circle cx={g.x} cy={g.y} r={9} fill={violet ? "#9a5cf0" : "#ffb21e"} opacity="0.35" className="fw-gem-glow" style={{ animationDelay: `${(i % 4) * 0.35}s` }} />
              <circle cx={g.x} cy={g.y} r={6.2} fill="#5b3d06" />
              <circle cx={g.x} cy={g.y} r={5} fill={violet ? "url(#cw-gem-violet)" : "url(#cw-gem-amber)"} />
              <circle cx={g.x - 1.6} cy={g.y - 1.8} r={1.4} fill="#fff" opacity="0.9" />
            </g>
          );
        })}

        {/* rotating disc */}
        <motion.g
          data-testid="climb-disc"
          animate={{ rotate: rotation }}
          transition={{ duration: seconds, ease: [0.12, 0.7, 0.15, 1] }}
          // SVG motion values use fill-box: the disc is a full circle centred on (C,C), so its box centre is the axis (50% 50%)
          style={{ originX: "50%", originY: "50%" }}
        >
          <circle cx={C} cy={C} r={R + 2} fill="#07060c" />
          {Array.from({ length: SLICES }, (_, i) => {
            const bad = danger.includes(i);
            const fill = bad ? "url(#cw-ruby-slice)" : i % 2 ? "url(#cw-velvet)" : "url(#cw-sapphire)";
            return (
              <g key={i} data-danger={bad}>
                <path d={slicePath(i)} fill={fill} />
                <path d={slicePath(i)} fill="url(#cw-depth)" />
                {sparkles[i].map((p, k) => (
                  <circle key={k} cx={p.x} cy={p.y} r={p.s} fill="#fff" opacity={bad ? p.o * 0.35 : p.o} />
                ))}
                <g clipPath={`url(#cw-clip-${i})`}>
                  <path d={slicePath(i)} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth={7} />
                </g>
                <path d={slicePath(i)} fill="none" stroke={bad ? "#ff8a98" : "#f3d98b"} strokeOpacity={bad ? 0.8 : 0.9} strokeWidth={1.4} />
                <g transform={`rotate(${i * STEP} ${C} ${C})`}>
                  {bad ? (
                    <text x={C} y={C - 112} textAnchor="middle" dominantBaseline="middle" fontSize={40}>💀</text>
                  ) : (
                    <>
                      {/* four-point star with a soft halo */}
                      <circle cx={C} cy={C - 112} r={17} fill="#fff1c2" opacity="0.1" />
                      <path d={`M${C} ${C - 132} L${C + 5} ${C - 117} L${C + 20} ${C - 112} L${C + 5} ${C - 107} L${C} ${C - 92} L${C - 5} ${C - 107} L${C - 20} ${C - 112} L${C - 5} ${C - 117} Z`} fill="#ffe9a0" stroke="#4a3205" strokeWidth={1.2} strokeLinejoin="round" />
                    </>
                  )}
                </g>
              </g>
            );
          })}
          {Array.from({ length: SLICES }, (_, i) => {
            const p = polar(R - 4, i * STEP + STEP / 2);
            return (
              <g key={i}>
                <circle cx={p.x + 1} cy={p.y + 1.5} r={5} fill="#000" opacity="0.5" />
                <circle cx={p.x} cy={p.y} r={4.6} fill="url(#cw-hub)" stroke="#4a3205" strokeWidth={0.8} />
                <circle cx={p.x - 1.2} cy={p.y - 1.3} r={1.2} fill="#fff" opacity="0.85" />
              </g>
            );
          })}
        </motion.g>

        {/* medallion hub */}
        <g>
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d={i % 2 === 0 ? "M0 -60 L8 -40 L-8 -40 Z" : "M0 -50 L6 -38 L-6 -38 Z"} transform={`translate(${C} ${C}) rotate(${i * 22.5})`} fill="url(#cw-hub)" stroke="#4a3205" strokeWidth={1} />
          ))}
          <circle cx={C} cy={C + 3} r={46} fill="#000" opacity="0.4" />
          <circle cx={C} cy={C} r={45} fill="url(#cw-hub)" stroke="#3d2903" strokeWidth={2.5} />
          <circle cx={C} cy={C} r={37} fill="url(#cw-rim-in)" />
          <circle cx={C} cy={C} r={32} fill="url(#cw-hub)" stroke="#5b3d06" strokeWidth={1.5} />
          <circle cx={C} cy={C} r={26} fill="url(#cw-core-glow)" className="fw-core-glow" />
          <circle cx={C} cy={C} r={19} fill="#1a0a4a" stroke="#f3d98b" strokeWidth={2} />
          <circle cx={C} cy={C} r={16.5} fill="url(#cw-core)" />
          <ellipse cx={C - 5} cy={C - 6} rx={6} ry={3.4} fill="#fff" opacity="0.75" transform={`rotate(-30 ${C - 5} ${C - 6})`} />
        </g>

        {/* golden crown pointer */}
        <g>
          <ellipse cx={C + 3} cy={52} rx={17} ry={7} fill="#000" opacity="0.35" />
          <path d="M222 8 L228 21 L240 4 L252 21 L258 8 L257 38 Q241 52 240 76 Q239 52 223 38 Z" fill="url(#cw-pointer)" stroke="#3d2903" strokeWidth={2} strokeLinejoin="round" />
          <path d="M240 4 L228 21 L222 8 L223 38 Q239 52 240 76 Z" fill="#fff" opacity="0.28" />
          <path d="M240 4 L252 21 L258 8 L257 38 Q241 52 240 76 Z" fill="#000" opacity="0.2" />
          <circle cx={C} cy={32} r={9} fill="#5b3d06" />
          <circle cx={C} cy={32} r={7.4} fill="url(#cw-ruby)" />
          <circle cx={C - 2.2} cy={29.5} r={1.9} fill="#fff" opacity="0.9" />
          <circle cx={C} cy={5} r={2.6} fill="#fff6c8" />
        </g>

        {/* fairy dust */}
        <g pointerEvents="none">
          {embers.map((e, i) => (
            <circle key={i} cx={e.x} cy={e.y} r={e.r} fill={e.big ? "#fff3c4" : "#ffc43a"} className="fw-ember" style={{ animationDelay: `${e.d}s`, animationDuration: `${e.dur}s` }} />
          ))}
        </g>
      </svg>
    </div>
  );
}
