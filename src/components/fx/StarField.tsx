"use client";

import { motion, useReducedMotion } from "framer-motion";

// Deterministic PRNG so server and client render identical stars (no hydration mismatch).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = { x: number; y: number; size: number; delay: number; duration: number; gold: boolean };

function makeStars(count: number, seed: number): Star[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    size: 1 + rand() * 2.2,
    delay: rand() * 4,
    duration: 2.5 + rand() * 3.5,
    gold: rand() > 0.7,
  }));
}

const STARS = makeStars(56, 20250117);
const DUST = makeStars(14, 777);

/** Twinkling stars + slowly rising gold dust. Purely decorative. */
export function StarField({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {STARS.map((s, i) => (
        <motion.span
          key={`s${i}`}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: s.gold ? "var(--gold-light)" : "var(--cream)",
            boxShadow: s.gold ? "0 0 6px var(--gold)" : "0 0 4px rgb(246 239 220 / 0.6)",
          }}
          initial={{ opacity: 0.25 }}
          animate={reduce ? { opacity: 0.5 } : { opacity: [0.15, 0.95, 0.15] }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: s.duration, delay: s.delay, repeat: Infinity, ease: "easeInOut" }
          }
        />
      ))}
      {!reduce &&
        DUST.map((d, i) => (
          <motion.span
            key={`d${i}`}
            className="absolute rounded-full bg-gold-light"
            style={{
              left: `${d.x}%`,
              bottom: "-4%",
              width: d.size + 1,
              height: d.size + 1,
              filter: "blur(0.5px)",
              boxShadow: "0 0 8px var(--gold)",
            }}
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: "-110vh", opacity: [0, 0.9, 0.9, 0] }}
            transition={{
              duration: 14 + d.duration * 3,
              delay: d.delay * 2,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
    </div>
  );
}
