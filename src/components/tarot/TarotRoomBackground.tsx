import Image from "next/image";
import roomImage from "../../../public/tarot-room.jpg";

/*
 * Full-screen backdrop for /tarot: Mae Mu Sandy's reading room (carved bookshelves,
 * candles, red velvet table). Rendered in the static shell so it paints first.
 *
 * Two tints cross-fade, driven by <html data-tarot-mood> (set by TarotExperience):
 *  - "portrait" (default, asking the question): light in the middle so Mae Mu
 *    Sandy's face shows, dark at the top for the title and at the bottom for the form.
 *  - "reading" (picking cards → result): an even, deeper tint so cards and text
 *    stay high-contrast against the busy shelves.
 */

const PORTRAIT_TINT = [
  // candle-warm glow around her, then readable dark bands top and bottom
  "radial-gradient(120% 55% at 50% 42%, rgb(11 10 18 / 0) 0%, rgb(11 10 18 / 0) 45%, rgb(11 10 18 / 0.55) 100%)",
  // 0–20%: header + title band (dark) · 28–50%: Mae Mu Sandy (clear) · 58%+: form (dark)
  "linear-gradient(180deg, rgb(11 10 18 / 0.9) 0%, rgb(11 10 18 / 0.8) 16%, rgb(11 10 18 / 0.55) 21%, rgb(11 10 18 / 0.06) 29%, rgb(11 10 18 / 0.04) 50%, rgb(11 10 18 / 0.75) 60%, rgb(11 10 18 / 0.9) 72%, rgb(11 10 18 / 0.96) 100%)",
].join(", ");

const READING_TINT = [
  "radial-gradient(90% 55% at 50% 40%, rgb(42 20 60 / 0.25) 0%, transparent 70%)",
  "linear-gradient(180deg, rgb(11 10 18 / 0.86) 0%, rgb(11 10 18 / 0.74) 35%, rgb(11 10 18 / 0.82) 70%, rgb(11 10 18 / 0.94) 100%)",
].join(", ");

export function TarotRoomBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-velvet">
      {/* Wide screens: soft blurred room fills the sides */}
      <Image
        src={roomImage}
        alt=""
        fill
        // Hidden on phones; it's blurred anyway, so a small file is plenty on wide screens.
        sizes="(min-width: 768px) 640px, 1px"
        loading="eager"
        className="hidden scale-110 object-cover opacity-45 blur-2xl md:block"
      />

      {/* The room: edge-to-edge cover on phones, a centred 9:16 panel on wider screens */}
      <div className="absolute inset-0 md:inset-y-0 md:right-auto md:left-1/2 md:aspect-[9/16] md:-translate-x-1/2">
        <Image
          src={roomImage}
          alt=""
          fill
          placeholder="blur"
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 768px) 57vh, 100vw"
          className="object-cover object-[50%_32%] brightness-110 saturate-110"
        />
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,var(--velvet)_0%,transparent_14%,transparent_86%,var(--velvet)_100%)] md:block" />
      </div>

      {/* Readability tints */}
      <div className="tarot-tint-portrait absolute inset-0 transition-opacity duration-700" style={{ background: PORTRAIT_TINT }} />
      <div className="tarot-tint-reading absolute inset-0 transition-opacity duration-700" style={{ background: READING_TINT }} />
    </div>
  );
}
