import type { ReactNode } from "react";

/** Small building blocks for the rules text (server-renderable). */
export function RuleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-1.5 font-serif text-base text-gold-light">{title}</h3>
      {children}
    </section>
  );
}

export function RuleList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-gold/70">{children}</ul>;
}
