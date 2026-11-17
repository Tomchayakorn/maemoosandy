"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";

type Block = { kind: "h" | "li" | "p"; graphemes: string[] };

/** Parse the reading's tiny markup ("## " heading, "- " bullet, paragraphs) into grapheme blocks. */
function parse(text: string): Block[] {
  const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
  const split = (s: string) => Array.from(segmenter.segment(s), (x) => x.segment);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("## ")) return { kind: "h" as const, graphemes: split(line.slice(3)) };
      if (line.startsWith("- ")) return { kind: "li" as const, graphemes: split(line.slice(2)) };
      return { kind: "p" as const, graphemes: split(line) };
    });
}

const PER_TICK = 3; // graphemes per frame tick (~16ms) → about 180 chars/sec

/**
 * Types the reading out line by line (Thai-safe: advances by grapheme cluster so
 * vowels and tone marks never render detached). Tap "แสดงทั้งหมด" to skip.
 */
export function TypewriterText({ text, onDone }: { text: string; onDone?: () => void }) {
  const blocks = useMemo(() => parse(text), [text]);
  const starts = useMemo(() => {
    const out: number[] = [];
    blocks.reduce((n, b) => (out.push(n), n + b.graphemes.length), 0);
    return out;
  }, [blocks]);
  const total = blocks.length ? starts[blocks.length - 1] + blocks[blocks.length - 1].graphemes.length : 0;
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const [skipped, setSkipped] = useState(false);

  const shown = reduce || skipped ? total : Math.min(count, total);
  const done = shown >= total;

  useEffect(() => {
    if (reduce || skipped) return;
    let raf = 0;
    let typed = 0;
    const tick = () => {
      typed += PER_TICK;
      setCount(typed);
      if (typed < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total, reduce, skipped]);

  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="off" className="flex flex-col gap-3">
        {blocks.map((b, i) => {
          const count = shown - starts[i];
          if (count <= 0) return null;
          const visible = b.graphemes.slice(0, count).join("");
          const typing = count < b.graphemes.length;
          const caret = typing ? <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-gold-light align-middle" /> : null;

          if (b.kind === "h")
            return (
              <h3 key={i} className="mt-3 flex items-center gap-2 font-serif text-base font-semibold text-gold-light first:mt-0">
                <span aria-hidden className="text-xs text-gold">✦</span>
                <span>{visible}{caret}</span>
              </h3>
            );
          if (b.kind === "li")
            return (
              <p key={i} className="flex gap-2 pl-1 text-[15px] leading-relaxed text-cream/90">
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-gold" />
                <span>{visible}{caret}</span>
              </p>
            );
          return (
            <p key={i} className="text-[15px] leading-relaxed text-cream/90">
              {visible}
              {caret}
            </p>
          );
        })}
      </div>
      {/* Screen readers get the full text at once. */}
      <p className="sr-only">{text}</p>

      {!done && (
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="self-center rounded-full px-4 py-2 text-xs text-gold-light/80 underline-offset-4 hover:underline"
        >
          แสดงทั้งหมด
        </button>
      )}
    </div>
  );
}
