import type { ReactNode } from "react";

/** Centered section heading with gold ornament lines. */
export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="flex w-full items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/60" />
        <span aria-hidden className="text-xs text-gold">✦</span>
        <h2 className="font-serif text-lg font-semibold text-gold-light">{children}</h2>
        <span aria-hidden className="text-xs text-gold">✦</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/60" />
      </div>
      {sub ? <p className="text-sm text-cream-muted">{sub}</p> : null}
    </div>
  );
}
