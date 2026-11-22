"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { buildBoard } from "@/lib/cat-game/config";

const BOARD = buildBoard();

/**
 * The 3×3 board of cats (3 orange / 3 black / 3 white), presentational only: the page or pop-up that owns it decides what a tap does.
 * Used by the game page and by the surprise pop-up.
 */
export function CatBoard({
  chosenIndex,
  loadingIndex,
  disabled,
  onPick,
  tileRefs,
}: {
  /** the cat that was picked (during loading and after the result) */
  chosenIndex: number | null;
  /** the cat being drawn right now */
  loadingIndex: number | null;
  /** nothing can be tapped (already played, not enough coins, drawing ...) */
  disabled: boolean;
  onPick: (index: number) => void;
  tileRefs?: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  const reduce = useReducedMotion();
  const picked = chosenIndex !== null;
  return (
    <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="เลือกน้องเหมียว 1 ตัว">
      {BOARD.map((cat) => {
        const chosen = chosenIndex === cat.index;
        const drawing = loadingIndex === cat.index;
        const dimmed = picked && !chosen;
        return (
          <motion.button
            key={cat.index}
            ref={(el) => {
              if (tileRefs) tileRefs.current[cat.index] = el;
            }}
            type="button"
            disabled={disabled}
            onClick={() => onPick(cat.index)}
            aria-label={`จิ้ม${cat.label}`}
            whileHover={reduce || disabled ? undefined : { scale: 1.05, y: -2 }}
            whileTap={reduce || disabled ? undefined : { scale: 0.93 }}
            animate={drawing && !reduce ? { rotate: [0, -4, 4, -3, 3, 0] } : { rotate: 0 }}
            transition={{ duration: 0.5 }}
            className={
              "group relative aspect-square overflow-hidden rounded-2xl border bg-velvet transition-[box-shadow,opacity,filter] duration-300 " +
              (chosen
                ? "border-gold-light shadow-[0_0_26px_-2px_rgb(243_217_139/0.9)]"
                : "border-gold/50 shadow-[0_0_14px_-6px_rgb(212_175_55/0.7)] hover:border-gold-light hover:shadow-[0_0_22px_-4px_rgb(243_217_139/0.85)]") +
              (dimmed ? " opacity-45 saturate-50" : "") +
              " disabled:cursor-default"
            }
          >
            <Image src={cat.src} alt="" fill sizes="(max-width: 448px) 30vw, 140px" quality={75} draggable={false} className="object-cover" />
            <span
              aria-hidden
              className={
                "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(243_217_139/0.35),transparent_40%),radial-gradient(circle_at_75%_80%,rgb(243_217_139/0.25),transparent_35%)] transition-opacity duration-300 " +
                (chosen ? "opacity-100" : "opacity-0 group-hover:opacity-100")
              }
            />
            {drawing && (
              <span aria-hidden className="absolute inset-0 flex animate-pulse items-center justify-center bg-velvet/40 font-tarot text-3xl text-gold">
                ✦
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
