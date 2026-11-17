"use client";

import { forwardRef, type ReactNode } from "react";
import { EmblemIcon } from "@/components/ui/icons";
import { TypewriterText } from "./TypewriterText";

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Extra content above the reading (e.g. the drawn cards or the computed numbers). */
  header?: ReactNode;
  text: string;
  onTypingDone?: () => void;
};

/**
 * The prediction card. Its outer element is what ShareButton captures, so it
 * carries its own background and brand footer.
 */
export const ReadingCard = forwardRef<HTMLDivElement, Props>(function ReadingCard(
  { title, subtitle, header, text, onTypingDone },
  ref,
) {
  return (
    <div
      ref={ref}
      className="border-gold-frame relative overflow-hidden rounded-3xl bg-[linear-gradient(165deg,#15131f_0%,#0f1530_55%,#0b0a12_100%)] px-5 pb-6 pt-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(212_175_55/0.22),transparent_70%)]"
      />
      <div className="relative flex flex-col items-center gap-2 text-center">
        <EmblemIcon className="size-10" />
        <h2 className="font-display text-3xl leading-snug">
          <span className="text-gold-gradient">{title}</span>
        </h2>
        {subtitle && <div className="text-sm text-cream-muted">{subtitle}</div>}
      </div>

      {header && <div className="relative mt-5">{header}</div>}

      <div className="relative my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/50" />
        <span aria-hidden className="text-xs text-gold">✦ ✦ ✦</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/50" />
      </div>

      <div className="relative">
        <TypewriterText text={text} onDone={onTypingDone} />
      </div>

      <p className="relative mt-6 text-center font-serif text-xs tracking-wide text-gold/80">
        แม่มูแซนดี้ ทำนายดวงชะตา · บ้าน ณ มัณตรา
      </p>
    </div>
  );
});
