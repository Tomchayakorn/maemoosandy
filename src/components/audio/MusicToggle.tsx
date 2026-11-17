"use client";

import { motion, useReducedMotion } from "framer-motion";
import { bgm } from "@/lib/audio/bgm";
import { useBgm } from "@/lib/audio/useBgm";

/** Header button: background music on/off (remembered per device). */
export function MusicToggle() {
  const { enabled, playing, ducked } = useBgm();
  const reduce = useReducedMotion();
  const audible = enabled && playing;

  return (
    <button
      type="button"
      data-bgm-toggle
      onClick={() => void bgm.setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? "ปิดเพลงประกอบ" : "เปิดเพลงประกอบ"}
      title={enabled ? (playing ? "ปิดเพลงประกอบ" : "เพลงจะเริ่มเมื่อแตะหน้าจอ") : "เปิดเพลงประกอบ"}
      className={
        "relative flex size-10 shrink-0 items-center justify-center rounded-full border transition " +
        (enabled
          ? "border-gold/50 bg-velvet/80 text-gold-light hover:border-gold"
          : "border-gold/20 bg-velvet/60 text-cream-muted hover:text-cream")
      }
    >
      {/* music note */}
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6.5" cy="18" r="2.5" fill="currentColor" fillOpacity="0.3" />
        <circle cx="16.5" cy="16" r="2.5" fill="currentColor" fillOpacity="0.3" />
        {!enabled && <path d="M3.5 3.5l17 17" strokeWidth="2" />}
      </svg>

      {/* tiny equaliser while music is audible; calmer while ducked under the voice */}
      {audible && (
        <span aria-hidden className="absolute -bottom-0.5 left-1/2 flex h-2 -translate-x-1/2 items-end gap-[2px]">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-[2px] rounded-full bg-gold-light"
              animate={reduce ? { height: 4 } : { height: ducked ? [2, 3, 2] : [2, 7, 3, 6, 2] }}
              transition={{ duration: ducked ? 1.6 : 1, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
