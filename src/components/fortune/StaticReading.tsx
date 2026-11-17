/** Renders a saved reading's markup ("## " headings, "- " bullets) without the typewriter effect. */
export function StaticReading({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div className="flex flex-col gap-2.5">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="mt-2 flex items-center gap-2 font-serif text-[15px] font-semibold text-gold-light first:mt-0">
              <span aria-hidden className="text-xs text-gold">✦</span>
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("- "))
          return (
            <p key={i} className="flex gap-2 pl-1 text-sm leading-relaxed text-cream/90">
              <span aria-hidden className="mt-[8px] size-1.5 shrink-0 rounded-full bg-gold" />
              <span>{line.slice(2)}</span>
            </p>
          );
        return (
          <p key={i} className="text-sm leading-relaxed text-cream/90">
            {line}
          </p>
        );
      })}
    </div>
  );
}
