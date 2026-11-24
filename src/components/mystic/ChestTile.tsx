"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";

export type TileKind = "closed" | "gem" | "curse-hit" | "curse-faint";

const CHEST_SRC = "/images/mystic-chest-tile.jpg"; // still crop of /mystic-chest.gif (nine animated GIFs would be too heavy)
const GEM_SRC = "/images/mystic-gem-tile.jpg"; // 384px crop of /mystic-gem.jpeg
const CURSE_SRC = "/images/mystic-curse-tile.jpg"; // 384px crop of /mystic-curse.jpeg

const SPARKLES = [
  { top: "10%", left: "14%", delay: "0s" },
  { top: "16%", left: "70%", delay: "0.5s" },
  { top: "62%", left: "8%", delay: "1s" },
  { top: "66%", left: "72%", delay: "0.3s" },
  { top: "38%", left: "76%", delay: "1.2s" },
] as const;

/**
 * One chest of เปิดหีบมนตรา. Presentation only: what a chest holds is decided by the server (mystic_open) and arrives as `kind`.
 *  - closed:      still of the golden chest, hover / tap feedback; while it is being opened the lid is "ajar": a slit of golden light
 *                 grows across the middle and a soft glow rises (the same for a safe and a cursed chest, so it never hints at the result)
 *  - gem:         the lucky gem pops in (spring), glows behind, floats gently, twinkles; `badge` shows the multiplier and coins on the last opened chest
 *  - curse-hit:   the curse seal pops in, shakes once, violet-red warning light
 *  - curse-faint: a cursed chest revealed after the round, shown faintly
 * Everything stays inside the tile (overflow-hidden, image inset). One-shot animations are framer-motion transforms/opacity with
 * will-change only while they run; the loops are CSS keyframes (globals.css) that only touch transform and opacity.
 */
export function ChestTile({
  index,
  kind,
  loading,
  disabled,
  badge,
  reduce,
  onOpen,
}: {
  index: number;
  kind: TileKind;
  loading: boolean;
  disabled: boolean;
  badge?: { mult: string; coins: number } | null;
  reduce: boolean;
  onOpen: () => void;
}) {
  const [popping, setPopping] = useState(false); // will-change only while the pop runs
  const wc = popping ? "transform, opacity" : "auto";
  const spring = { type: "spring" as const, stiffness: 320, damping: 17, mass: 0.8 };

  const frame =
    kind === "curse-hit"
      ? "border-rose-400/80 shadow-[0_0_26px_-4px_rgb(190_24_93/0.85)]"
      : kind === "gem"
        ? "border-gold-light shadow-[0_0_22px_-4px_rgb(243_217_139/0.85)]"
        : kind === "curse-faint"
          ? "border-rose-400/30"
          : "border-gold/50 shadow-[0_0_14px_-6px_rgb(212_175_55/0.7)] hover:border-gold-light";

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      aria-label={`เปิดหีบใบที่ ${index + 1}`}
      whileHover={reduce || disabled || kind !== "closed" ? undefined : { scale: 1.05, y: -2 }}
      whileTap={reduce || disabled || kind !== "closed" ? undefined : { scale: 0.94 }}
      animate={loading && !reduce ? { rotate: [0, -5, 5, -4, 4, 0] } : { rotate: 0 }}
      transition={{ duration: 0.45 }}
      className={"relative aspect-square overflow-hidden rounded-2xl border bg-velvet transition-[box-shadow,border-color] duration-300 disabled:cursor-default " + frame}
    >
      {kind === "closed" && (
        <>
          <Image src={CHEST_SRC} alt="" fill sizes="(max-width: 448px) 30vw, 140px" quality={75} draggable={false} className="object-cover" />
          <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_40%,rgb(11_10_18/0.55))]" />
          {loading && (
            <>
              {/* soft glow rising from the crack: a static gradient whose opacity fades in (no blur, no shadow) */}
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgb(243_217_139/0.55),rgb(212_175_55/0.2)_38%,transparent_66%)]"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              />
              {/* the slit of light between lid and body: scaleY/scaleX + opacity only */}
              <motion.span
                aria-hidden
                data-testid="chest-slit"
                className="pointer-events-none absolute left-[14%] right-[14%] top-[47%] h-[6%] origin-center rounded-full bg-gradient-to-r from-transparent via-gold-light to-transparent"
                initial={reduce ? false : { scaleX: 0.2, scaleY: 0.2, opacity: 0 }}
                animate={{ scaleX: 1, scaleY: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </>
          )}
        </>
      )}

      {kind === "gem" && (
        <motion.span
          className="absolute inset-0 block"
          initial={reduce ? false : { scale: 0.55, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
          style={{ willChange: wc }}
          onAnimationStart={() => setPopping(true)}
          onAnimationComplete={() => setPopping(false)}
        >
          {/* light behind the gem */}
          <span aria-hidden className="mystic-glow absolute inset-0 bg-[radial-gradient(circle,rgb(243_217_139/0.55),rgb(168_85_247/0.25)_45%,transparent_72%)]" />
          {/* the gem floats gently (CSS keyframes: translate3d + scale only) */}
          <span className="mystic-float absolute inset-[7%] block">
            <Image src={GEM_SRC} alt="อัญมณีนำโชค" fill sizes="(max-width: 448px) 28vw, 120px" quality={75} draggable={false} className="rounded-xl object-cover" />
          </span>
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              aria-hidden
              className="mystic-twinkle pointer-events-none absolute text-[10px] leading-none text-gold-light [text-shadow:0_0_6px_rgb(243_217_139)]"
              style={{ top: s.top, left: s.left, animationDelay: s.delay }}
            >
              ✦
            </span>
          ))}
          {badge && (
            <motion.span
              className="absolute inset-x-1 bottom-1 flex flex-col items-center rounded-lg border border-gold/60 bg-velvet/85 px-1 py-0.5 leading-none shadow-[0_0_10px_rgb(212_175_55/0.5)]"
              initial={reduce ? false : { scale: 0.4, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.12 }}
            >
              <span className="font-tarot text-[11px] font-bold text-gold-light">{badge.mult}</span>
              <span className="text-[10px] text-cream">+{badge.coins.toLocaleString("th-TH")}</span>
            </motion.span>
          )}
        </motion.span>
      )}

      {kind === "curse-hit" && (
        <motion.span
          className="absolute inset-0 block"
          initial={reduce ? false : { scale: 0.7, opacity: 0, x: 0 }}
          animate={reduce ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1, x: [0, -4, 4, -3, 3, -1, 0] }}
          transition={{ scale: spring, opacity: { duration: 0.18 }, x: { duration: 0.5, delay: 0.1, ease: "easeOut" } }}
          style={{ willChange: wc }}
          onAnimationStart={() => setPopping(true)}
          onAnimationComplete={() => setPopping(false)}
        >
          {/* violet-red warning light */}
          <span aria-hidden className="mystic-curse-glow absolute inset-0 bg-[radial-gradient(circle,rgb(236_72_153/0.6),rgb(127_29_29/0.4)_50%,transparent_78%)]" />
          <span className="absolute inset-[7%] block">
            <Image src={CURSE_SRC} alt="ตราอาถรรพ์" fill sizes="(max-width: 448px) 28vw, 120px" quality={75} draggable={false} className="rounded-xl object-cover" />
          </span>
          <span className="sr-only">จุดอาถรรพ์</span>
        </motion.span>
      )}

      {kind === "curse-faint" && (
        <motion.span className="absolute inset-0 block" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ duration: 0.4 }}>
          <span className="absolute inset-[10%] block">
            <Image src={CURSE_SRC} alt="" fill sizes="(max-width: 448px) 26vw, 110px" quality={75} draggable={false} className="rounded-xl object-cover grayscale-[40%]" />
          </span>
        </motion.span>
      )}
    </motion.button>
  );
}
