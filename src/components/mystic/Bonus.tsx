import { BONUS_ODDS, BONUS_ROLLS, BONUS_UNLOCK_SAFE, type Bonus } from "@/lib/mystic/config";

/** The bonus badges of เปิดหีบมนตรา (violet and gold). Display only: they show what the server stored on the round and never decide anything. */
const ASCENDING = [...BONUS_ODDS].sort((a, b) => a.bonus - b.bonus);
const percent = (rolls: number) => `${(rolls / BONUS_ROLLS) * 100}%`;

/**
 * The x2 / x5 / x8 row.
 *   no round  → what can be unlocked, with the chances (two lines, under the start button)
 *   locked    → how many safe chests are left
 *   unlocked  → the multiplier of this round lit in gold (or "no bonus this time")
 * During a round it is a single line, so the board, the numbers and the cash-out button still fit a phone screen.
 */
export function ChestBonusStrip({ safeCount, bonus }: { safeCount: number | null; bonus: Bonus | null }) {
  const state = bonus !== null ? (bonus > 1 ? "won" : "none") : safeCount === null ? "preview" : "locked";
  const preview = state === "preview";
  const left = Math.max(1, BONUS_UNLOCK_SAFE - (safeCount ?? 0));
  return (
    <div
      data-testid="chest-bonus-strip"
      data-state={state}
      aria-live="polite"
      className={
        "rounded-xl border px-2 " +
        (preview ? "flex flex-col gap-1 py-1.5 text-center " : "flex items-center gap-2 py-0.5 text-left ") +
        (state === "won"
          ? "border-gold-light bg-[linear-gradient(100deg,rgb(126_70_201/0.4),rgb(212_175_55/0.22))] shadow-[0_0_20px_-6px_rgb(243_217_139/0.85)]"
          : "border-purple-300/40 bg-purple-500/10")
      }
    >
      <p className={"text-xs leading-tight " + (preview ? "text-purple-100" : "min-w-0 flex-1 ") + (state === "won" ? "font-semibold text-gold-light" : preview ? "" : "text-purple-100")}>
        {state === "won" && <>✨ โบนัสรอบนี้ ×{bonus}</>}
        {state === "none" && <>รอบนี้ไม่ติดโบนัส (×1)</>}
        {state === "locked" && <>🔒 อีก {left} ใบ ปลดล็อกโบนัส</>}
        {preview && <>🎁 เปิดปลอดภัยใบที่ {BONUS_UNLOCK_SAFE} ปลดล็อกโบนัสตัวคูณ (สุ่ม 1 ครั้งต่อรอบ)</>}
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
                (lit ? "border-gold-light bg-[linear-gradient(160deg,#fbe8a0,#d4af37)] text-velvet" : "border-gold/35 text-gold-light " + (bonus !== null ? "opacity-35" : ""))
              }
            >
              <b className="font-tarot text-sm leading-tight">×{o.bonus}</b>
              {preview && <span className="text-[10px] text-cream-muted">{percent(o.rolls)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Around the board while the round holds a bonus: a breathing violet-gold ring and a badge on the corner. Takes no touches. */
export function ChestBonusAura({ bonus }: { bonus: Bonus }) {
  return (
    <div aria-hidden data-testid="chest-bonus-aura" className="pointer-events-none absolute -inset-1.5">
      <span className="mystic-bonus-ring absolute inset-0 rounded-3xl" />
      <span className="mystic-bonus-pill absolute -right-3 -top-2 rounded-full border-2 border-[#fff3bd] bg-[linear-gradient(160deg,#fbe8a0,#c9961f)] px-2.5 py-0.5 font-tarot text-lg font-bold leading-tight text-velvet shadow-[0_0_16px_rgb(243_217_139/0.85)]">
        ×{bonus}
      </span>
    </div>
  );
}

/** The moment of unlocking: the multiplier pops over the board once and fades. Takes no touches, hidden under reduced motion. */
export function ChestBonusBurst({ bonus, onDone }: { bonus: Bonus; onDone: () => void }) {
  return (
    <div aria-hidden data-testid="chest-bonus-burst" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="mystic-burst flex flex-col items-center rounded-full px-9 py-5" onAnimationEnd={onDone}>
        <span className="font-serif text-sm font-semibold text-gold-light">โบนัสปลดล็อก!</span>
        <span className="font-tarot text-6xl font-bold leading-none text-gold-gradient">×{bonus}</span>
      </div>
    </div>
  );
}
