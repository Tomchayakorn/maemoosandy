import { BONUS_ODDS, BONUS_ROLLS, BONUS_UNLOCK_LEVEL, type Bonus } from "@/lib/power-wheel/config";

/** The bonus badges of วงล้อไต่ชั้น. Display only: they show what the server stored on the round and never decide anything. */
const ASCENDING = [...BONUS_ODDS].sort((a, b) => a.bonus - b.bonus);
const percent = (rolls: number) => `${(rolls / BONUS_ROLLS) * 100}%`;

/**
 * The x2 / x5 / x8 row.
 *   no round  → what can be unlocked, with the chances (two lines, under the start button)
 *   locked    → how many levels are left
 *   unlocked  → the multiplier of this round lit in gold (or "no bonus this time")
 * During a round it is a single line, so it stays above the floating contact button on a phone.
 */
export function BonusStrip({ level, bonus }: { level: number | null; bonus: Bonus | null }) {
  const state = bonus !== null ? (bonus > 1 ? "won" : "none") : level === null ? "preview" : "locked";
  const preview = state === "preview";
  const left = Math.max(1, BONUS_UNLOCK_LEVEL - (level ?? 0));
  return (
    <div
      data-testid="bonus-strip"
      data-state={state}
      aria-live="polite"
      className={
        "rounded-2xl border px-2 " +
        (preview ? "flex flex-col gap-1 py-1.5 text-center " : "flex items-center gap-2 py-1 text-left ") +
        (state === "won" ? "border-gold-light bg-gold/15 shadow-[0_0_20px_-6px_rgb(243_217_139/0.85)]" : "border-gold/30 bg-midnight/60")
      }
    >
      <p className={"text-xs leading-tight " + (preview ? "" : "min-w-0 flex-1 ") + (state === "won" ? "font-semibold text-gold-light" : "text-cream-muted")}>
        {state === "won" && <>✨ โบนัสรอบนี้ ×{bonus}</>}
        {state === "none" && <>รอบนี้ไม่ติดโบนัส (×1)</>}
        {state === "locked" && <>🔒 อีก {left} ชั้น ปลดล็อกโบนัส</>}
        {preview && <>🎁 ผ่านชั้น {BONUS_UNLOCK_LEVEL} ปลดล็อกโบนัสตัวคูณ (สุ่ม 1 ครั้งต่อรอบ)</>}
      </p>
      <ul className={"flex gap-1.5 " + (preview ? "justify-center" : "shrink-0")} aria-label="โบนัสตัวคูณ">
        {ASCENDING.map((o) => {
          const lit = bonus === o.bonus;
          return (
            <li
              key={o.bonus}
              data-bonus={o.bonus}
              data-lit={lit}
              className={
                "flex items-baseline justify-center gap-1 rounded-lg border py-0.5 " +
                (preview ? "flex-1 " : "w-11 ") +
                (lit ? "border-gold-light bg-[linear-gradient(160deg,#fbe8a0,#d4af37)] text-velvet" : "border-gold/30 text-gold-light " + (bonus !== null ? "opacity-35" : ""))
              }
            >
              <b className="font-tarot text-base leading-tight">×{o.bonus}</b>
              {preview && <span className="text-[10px] text-cream-muted">{percent(o.rolls)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Laid over the wheel's box while the round holds a bonus: a breathing gold ring and a badge in the corner. Takes no touches. */
export function BonusAura({ bonus }: { bonus: Bonus }) {
  return (
    <div aria-hidden data-testid="bonus-aura" className="pointer-events-none absolute inset-0">
      <span className="pw-bonus-ring absolute left-1/2 top-1/2 aspect-square w-[min(90%,19rem)] rounded-full" />
      <span className="pw-bonus-pill absolute right-0 top-0 rounded-full border-2 border-[#fff3bd] bg-[linear-gradient(160deg,#fbe8a0,#c9961f)] px-3 py-1 font-tarot text-xl font-bold leading-none text-velvet shadow-[0_0_18px_rgb(243_217_139/0.85)]">
        ×{bonus}
      </span>
    </div>
  );
}

/** The moment of unlocking: the multiplier pops over the middle of the wheel once and fades. Takes no touches, hidden under reduced motion. */
export function BonusBurst({ bonus, onDone }: { bonus: Bonus; onDone: () => void }) {
  return (
    <div aria-hidden data-testid="bonus-burst" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pw-burst flex flex-col items-center rounded-full px-10 py-6" onAnimationEnd={onDone}>
        <span className="font-serif text-sm font-semibold text-gold-light">โบนัสปลดล็อก!</span>
        <span className="font-tarot text-7xl font-bold leading-none text-gold-gradient">×{bonus}</span>
      </div>
    </div>
  );
}
