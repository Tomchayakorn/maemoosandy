import { useId, type ReactNode } from "react";
import { cardCornerLabel, type Suit, type TarotCardDef } from "@/lib/tarot/deck";

/*
 * Ornate, original SVG tarot art for บ้าน ณ มัณตรา.
 * viewBox 0 0 200 320. Every instance gets its own gradient/filter ids (useId)
 * so dozens of cards on one page — and html-to-image clones — never collide.
 */

/** Round trig-derived coordinates: Math.sin/cos may differ in the last digits between Node and the browser (hydration mismatch). */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

const CX = 100;
const CY = 156;
const TITLE_FONT = "var(--font-cinzel), Georgia, 'Times New Roman', serif";

/* ---------- geometry helpers ---------- */

function starPath(cx: number, cy: number, outer: number, inner: number, points: number, rotateDeg = -90): string {
  const step = Math.PI / points;
  const start = (rotateDeg * Math.PI) / 180;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = start + i * step;
    d += `${i === 0 ? "M" : "L"}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * Crescent lit on the left, opening to the right. The outer edge is a half
 * circle; the inner edge is a flatter arc whose bulge leaves `thickness`×r of moon.
 */
function crescentPath(cx: number, cy: number, r: number, thickness = 0.62): string {
  const bulge = r * (1 - thickness);
  const inner = (r * r + bulge * bulge) / (2 * bulge);
  return `M${cx} ${cy - r}A${r} ${r} 0 0 0 ${cx} ${cy + r}A${inner.toFixed(2)} ${inner.toFixed(2)} 0 0 1 ${cx} ${cy - r}Z`;
}

function ticks(cx: number, cy: number, r1: number, r2: number, n: number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d += `M${(cx + r1 * Math.cos(a)).toFixed(2)} ${(cy + r1 * Math.sin(a)).toFixed(2)}L${(cx + r2 * Math.cos(a)).toFixed(2)} ${(cy + r2 * Math.sin(a)).toFixed(2)}`;
  }
  return d;
}

// Deterministic star field (no Math.random → identical on server and client).
const STARDUST = Array.from({ length: 34 }, (_, i) => {
  const x = 18 + ((i * 73) % 164);
  const y = 18 + ((i * 131 + 17) % 284);
  const r = 0.35 + ((i * 7) % 5) * 0.18;
  const o = 0.25 + ((i * 11) % 6) * 0.1;
  return { x, y, r, o };
});

/* ---------- shared defs & frame ---------- */

function useIds() {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (name: string) => `${raw}-${name}`;
  return { id, url: (name: string) => `url(#${id(name)})` };
}

type Ids = ReturnType<typeof useIds>;

function Defs({ id, variant }: { id: Ids["id"]; variant: "face" | "back" }) {
  return (
    <defs>
      {/* polished metallic gold */}
      <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6e4f0e" />
        <stop offset="0.18" stopColor="#f9e7a6" />
        <stop offset="0.38" stopColor="#d4af37" />
        <stop offset="0.52" stopColor="#fff6d5" />
        <stop offset="0.7" stopColor="#b8891f" />
        <stop offset="1" stopColor="#5c420b" />
      </linearGradient>
      <linearGradient id={id("goldV")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff3c4" />
        <stop offset="0.45" stopColor="#d4af37" />
        <stop offset="1" stopColor="#7a5a12" />
      </linearGradient>
      <linearGradient id={id("steel")} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#9c8a5c" />
        <stop offset="0.45" stopColor="#fffaf0" />
        <stop offset="0.55" stopColor="#efe2bd" />
        <stop offset="1" stopColor="#8a7748" />
      </linearGradient>
      {/* celestial surface */}
      <radialGradient id={id("surface")} cx="50%" cy="40%" r="78%">
        {variant === "face" ? (
          <>
            <stop offset="0" stopColor="#33266e" />
            <stop offset="0.4" stopColor="#1d1650" />
            <stop offset="0.75" stopColor="#100c30" />
            <stop offset="1" stopColor="#07060f" />
          </>
        ) : (
          <>
            <stop offset="0" stopColor="#3a1f5c" />
            <stop offset="0.45" stopColor="#1b1036" />
            <stop offset="0.8" stopColor="#0d0820" />
            <stop offset="1" stopColor="#050409" />
          </>
        )}
      </radialGradient>
      {/* nebula haze */}
      <radialGradient id={id("nebula")} cx="30%" cy="70%" r="60%">
        <stop offset="0" stopColor="#7b4fb8" stopOpacity="0.35" />
        <stop offset="1" stopColor="#7b4fb8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={id("halo")} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.55" />
        <stop offset="0.45" stopColor="#d4af37" stopOpacity="0.18" />
        <stop offset="1" stopColor="#d4af37" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={id("vignette")} cx="50%" cy="50%" r="72%">
        <stop offset="0.6" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.6" />
      </radialGradient>
      <radialGradient id={id("jewel")} cx="35%" cy="35%" r="70%">
        <stop offset="0" stopColor="#ffd1d6" />
        <stop offset="0.4" stopColor="#c43b4e" />
        <stop offset="1" stopColor="#5a0f1c" />
      </radialGradient>
      <radialGradient id={id("crystal")} cx="40%" cy="30%" r="75%">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.45" stopColor="#d9c4ff" />
        <stop offset="1" stopColor="#6d4fb0" />
      </radialGradient>
      {/* parchment grain */}
      <pattern id={id("grain")} width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 6L6 0" stroke="#d4af37" strokeOpacity="0.06" strokeWidth="0.6" />
      </pattern>
      {/* soft golden glow around engraved motifs */}
      <filter id={id("glow")} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="blur" />
        <feFlood floodColor="#f3d98b" floodOpacity="0.55" />
        <feComposite in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <clipPath id={id("panel")}>
        <rect x="12" y="12" width="176" height="296" rx="9" />
      </clipPath>
    </defs>
  );
}

/** Scrolling filigree for one corner, drawn for the top-left; mirrored for the others. */
function CornerFlourish({ gold }: { gold: string }) {
  return (
    <g fill="none" stroke={gold} strokeLinecap="round">
      <path d="M3 44C3 20 20 3 44 3" strokeWidth="1.6" />
      <path d="M9 38C7 24 13 13 25 11C31 10 34 16 29 18C25 19 23 15 26 14" strokeWidth="1.1" />
      <path d="M38 9C24 7 13 13 11 25C10 31 16 34 18 29C19 25 15 23 14 26" strokeWidth="1.1" />
      <path d="M44 3C50 3 54 6 56 10M3 44C3 50 6 54 10 56" strokeWidth="0.9" strokeOpacity="0.8" />
      <path d="M0 0L11 4L4 11Z" fill={gold} stroke="none" />
      <circle cx="19" cy="19" r="2.2" fill={gold} stroke="none" />
      <circle cx="58" cy="12" r="1.2" fill={gold} stroke="none" />
      <circle cx="12" cy="58" r="1.2" fill={gold} stroke="none" />
    </g>
  );
}

/** Outer bevelled frame, celestial panel, beaded inner borders and four corner flourishes. */
function Frame({ ids, children }: { ids: Ids; children: ReactNode }) {
  const { url } = ids;
  return (
    <>
      {/* bevel: dark rim → polished gold → bright inner highlight */}
      <rect x="1.5" y="1.5" width="197" height="317" rx="15" fill="#120d05" stroke="#3b2a08" strokeWidth="3" />
      <rect x="3.5" y="3.5" width="193" height="313" rx="13" fill="none" stroke={url("gold")} strokeWidth="5" />
      <rect x="6.5" y="6.5" width="187" height="307" rx="11" fill="none" stroke="#fff3c4" strokeOpacity="0.45" strokeWidth="0.8" />
      <rect x="9" y="9" width="182" height="302" rx="10" fill="none" stroke="#3b2a08" strokeWidth="1.2" />

      {/* panel surface */}
      <g clipPath={url("panel")}>
        <rect x="12" y="12" width="176" height="296" fill={url("surface")} />
        <rect x="12" y="12" width="176" height="296" fill={url("nebula")} />
        <rect x="12" y="12" width="176" height="296" fill={url("grain")} />
        {STARDUST.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i % 3 === 0 ? "#fff6d5" : "#d4af37"} opacity={s.o} />
        ))}
        {children}
        <rect x="12" y="12" width="176" height="296" fill={url("vignette")} />
      </g>

      {/* inner borders */}
      <rect x="17" y="17" width="166" height="286" rx="6" fill="none" stroke={url("gold")} strokeWidth="1.3" />
      <rect x="21" y="21" width="158" height="278" rx="4" fill="none" stroke={url("goldV")} strokeWidth="1" strokeDasharray="0.1 3.2" strokeLinecap="round" />

      {/* filigree corners */}
      <g transform="translate(17 17)"><CornerFlourish gold={url("gold")} /></g>
      <g transform="translate(183 17) scale(-1 1)"><CornerFlourish gold={url("gold")} /></g>
      <g transform="translate(17 303) scale(1 -1)"><CornerFlourish gold={url("gold")} /></g>
      <g transform="translate(183 303) scale(-1 -1)"><CornerFlourish gold={url("gold")} /></g>
    </>
  );
}

/* ---------- card back ---------- */

/** Face-down design: a celestial mandala with moon phases. */
export function CardBack() {
  const ids = useIds();
  const { id, url } = ids;
  return (
    <svg viewBox="0 0 200 320" className="size-full" aria-hidden>
      <Defs id={id} variant="back" />
      <Frame ids={ids}>
        <circle cx={CX} cy={160} r="74" fill={url("halo")} />
        <g fill="none" stroke={url("gold")}>
          <path d={starPath(CX, 160, 70, 30, 8)} strokeWidth="0.9" strokeOpacity="0.55" />
          <path d={starPath(CX, 160, 70, 30, 8, -67.5)} strokeWidth="0.7" strokeOpacity="0.35" />
          <circle cx={CX} cy={160} r="58" strokeWidth="1.3" />
          <circle cx={CX} cy={160} r="54" strokeWidth="1" strokeDasharray="0.1 3" strokeLinecap="round" />
          <path d={ticks(CX, 160, 44, 52, 48)} strokeWidth="0.6" strokeOpacity="0.7" />
          <circle cx={CX} cy={160} r="42" strokeWidth="1.2" />
        </g>
        <circle cx={CX} cy={160} r="41" fill="#0d0820" fillOpacity="0.7" />
        <g filter={url("glow")}>
          <path d={crescentPath(96, 160, 24)} fill={url("gold")} />
          <path d={starPath(108, 152, 9, 3.6, 5)} fill="#fff6d5" />
        </g>
        {/* moon phases, top and bottom */}
        {[44, 276].map((y) => (
          <g key={y}>
            <path d={crescentPath(72, y, 6)} fill={url("gold")} />
            <circle cx={CX} cy={y} r="7" fill={url("gold")} />
            <circle cx={CX} cy={y} r="9.5" fill="none" stroke={url("gold")} strokeWidth="0.6" strokeOpacity="0.7" />
            <g transform={`translate(${2 * 128} 0) scale(-1 1)`}>
              <path d={crescentPath(128, y, 6)} fill={url("gold")} />
            </g>
            <path d={`M48 ${y}H60M140 ${y}H152`} stroke={url("gold")} strokeWidth="0.8" />
          </g>
        ))}
        {/* small four-point sparkles */}
        {[
          [44, 92],
          [156, 96],
          [42, 226],
          [158, 228],
        ].map(([x, y]) => (
          <path key={`${x}-${y}`} d={starPath(x, y, 5, 1.2, 4)} fill="#fff6d5" opacity="0.85" />
        ))}
      </Frame>
    </svg>
  );
}

/* ---------- engraved suit symbols ---------- */

function Chalice({ url }: { url: Ids["url"] }) {
  return (
    <g>
      {/* rising holy water */}
      <path d="M100 90C96 98 96 103 100 106C104 103 104 98 100 90Z" fill="#cfe6ff" opacity="0.9" />
      <path d="M88 98C86 102 86 105 88 106.5C90 105 90 102 88 98ZM112 98C110 102 110 105 112 106.5C114 105 114 102 112 98Z" fill="#cfe6ff" opacity="0.7" />
      {/* bowl */}
      <path d="M68 116H132C132 145 118 161 100 163C82 161 68 145 68 116Z" fill={url("gold")} stroke="#5c420b" strokeWidth="1" />
      <ellipse cx="100" cy="116" rx="32" ry="5.5" fill="#2a1d05" stroke={url("goldV")} strokeWidth="1.4" />
      <path d="M76 126C80 142 88 152 100 155M124 126C120 142 112 152 100 155" fill="none" stroke="#6e4f0e" strokeWidth="0.7" opacity="0.7" />
      <path d="M74 131H126" stroke="#fff3c4" strokeWidth="1.2" opacity="0.55" />
      <path d="M77 136H123" stroke="#6e4f0e" strokeWidth="0.6" strokeDasharray="1 2" />
      <circle cx="100" cy="143" r="5" fill={url("jewel")} stroke={url("goldV")} strokeWidth="1.2" />
      {/* knops, stem, foot */}
      <ellipse cx="100" cy="169" rx="9" ry="5.5" fill={url("gold")} stroke="#5c420b" strokeWidth="0.8" />
      <rect x="96.5" y="163" width="7" height="27" rx="2" fill={url("goldV")} />
      <ellipse cx="100" cy="184" rx="6" ry="3.6" fill={url("gold")} stroke="#5c420b" strokeWidth="0.6" />
      <path d="M76 205C82 195 92 191 100 191C108 191 118 195 124 205Z" fill={url("gold")} stroke="#5c420b" strokeWidth="0.9" />
      <rect x="73" y="204" width="54" height="5" rx="2.5" fill={url("goldV")} />
      <path d="M84 200C90 197 110 197 116 200" fill="none" stroke="#fff3c4" strokeWidth="0.7" opacity="0.6" />
    </g>
  );
}

function Wand({ url }: { url: Ids["url"] }) {
  return (
    <g transform={`rotate(-16 ${CX} ${CY})`}>
      <rect x="95" y="100" width="10" height="112" rx="4" fill={url("goldV")} stroke="#5c420b" strokeWidth="0.8" />
      {/* spiral binding */}
      {[118, 128, 138, 182, 192].map((y) => (
        <path key={y} d={`M95 ${y}L105 ${y - 5}`} stroke="#5c420b" strokeWidth="1.1" />
      ))}
      <rect x="93" y="150" width="14" height="16" rx="3" fill={url("gold")} stroke="#5c420b" strokeWidth="0.8" />
      <circle cx="100" cy="158" r="3.2" fill={url("jewel")} />
      {/* budding leaves */}
      {[
        [95, 124, -1],
        [105, 140, 1],
        [95, 176, -1],
        [105, 196, 1],
      ].map(([x, y, side]) => (
        <path
          key={y}
          d={`M${x} ${y}C${x + side * 12} ${y - 10} ${x + side * 20} ${y - 6} ${x + side * 22} ${y - 14}C${x + side * 12} ${y - 14} ${x + side * 6} ${y - 6} ${x} ${y}Z`}
          fill="#c9dc9f"
          stroke={url("goldV")}
          strokeWidth="0.6"
          opacity="0.9"
        />
      ))}
      {/* crystal finial */}
      <path d="M100 74L109 92L100 104L91 92Z" fill={url("crystal")} stroke={url("goldV")} strokeWidth="1.2" />
      <path d="M100 74L100 104M91 92H109" stroke="#ffffff" strokeWidth="0.5" opacity="0.6" />
      <path d={starPath(100, 72, 7, 1.6, 4)} fill="#fff6d5" />
      <ellipse cx="100" cy="214" rx="6" ry="3" fill={url("gold")} />
    </g>
  );
}

function Sword({ url }: { url: Ids["url"] }) {
  return (
    <g>
      {/* blade */}
      <path d="M100 82L108 96V184H92V96Z" fill={url("steel")} stroke="#6e5a2a" strokeWidth="0.8" />
      <path d="M100 96V182" stroke="#8a7748" strokeWidth="1.4" />
      <path d="M100 96V182" stroke="#fffaf0" strokeWidth="0.4" transform="translate(1 0)" />
      {/* royal crown pierced by the blade (Ace of Swords tradition) */}
      <path d="M82 120L84 101L92 110L100 96L108 110L116 101L118 120Z" fill={url("gold")} stroke="#5c420b" strokeWidth="0.9" strokeLinejoin="round" />
      <rect x="81" y="117" width="38" height="6" rx="2" fill={url("goldV")} stroke="#5c420b" strokeWidth="0.6" />
      <circle cx="84" cy="100" r="2.4" fill={url("jewel")} />
      <circle cx="100" cy="95" r="2.8" fill={url("crystal")} />
      <circle cx="116" cy="100" r="2.4" fill={url("jewel")} />
      <circle cx="90" cy="120" r="1.4" fill="#fff6d5" />
      <circle cx="110" cy="120" r="1.4" fill="#fff6d5" />
      {/* cross-guard with scroll ends */}
      <path d="M68 186C76 180 88 183 100 183C112 183 124 180 132 186C124 191 112 192 100 192C88 192 76 191 68 186Z" fill={url("gold")} stroke="#5c420b" strokeWidth="0.8" />
      <path d="M68 186C63 183 63 177 68 177C71 177 71 181 69 181M132 186C137 183 137 177 132 177C129 177 129 181 131 181" fill="none" stroke={url("gold")} strokeWidth="1.6" />
      <circle cx="100" cy="187.5" r="3.4" fill={url("jewel")} />
      {/* grip and pommel */}
      <rect x="96" y="192" width="8" height="22" rx="2" fill="#3b2a08" stroke={url("goldV")} strokeWidth="0.8" />
      {[196, 201, 206, 211].map((y) => (
        <path key={y} d={`M96 ${y}L104 ${y - 3}`} stroke={url("gold")} strokeWidth="0.9" />
      ))}
      <circle cx="100" cy="219" r="6.5" fill={url("gold")} stroke="#5c420b" strokeWidth="0.8" />
      <circle cx="100" cy="219" r="2.6" fill={url("jewel")} />
    </g>
  );
}

function Pentacle({ url }: { url: Ids["url"] }) {
  return (
    <g>
      <circle cx={CX} cy={CY} r="42" fill={url("gold")} stroke="#5c420b" strokeWidth="1" />
      <circle cx={CX} cy={CY} r="35" fill="#1a1440" stroke="#5c420b" strokeWidth="1" />
      {/* engraved beads on the rim */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <circle key={i} cx={r4(CX + 38.5 * Math.cos(a))} cy={r4(CY + 38.5 * Math.sin(a))} r="1.3" fill="#5c420b" />;
      })}
      <circle cx={CX} cy={CY} r="31" fill="none" stroke={url("goldV")} strokeWidth="1.4" />
      <path d={starPath(CX, CY, 29, 11.1, 5)} fill="none" stroke={url("gold")} strokeWidth="1.2" strokeOpacity="0.5" />
      <path
        d="M100 127L117.05 179.47L72.41 147.03H127.59L82.95 179.47Z"
        fill="none"
        stroke={url("gold")}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx={CX} cy={CY} r="4" fill={url("jewel")} />
    </g>
  );
}

/* ---------- major arcana motifs ---------- */

function SunMotif({ url }: { url: Ids["url"] }) {
  return (
    <g>
      {Array.from({ length: 16 }, (_, i) => {
        const wavy = i % 2 === 1;
        return (
          <path
            key={i}
            d={wavy ? "M100 121C104 113 96 106 100 96" : "M96.5 124L100 88L103.5 124Z"}
            fill={wavy ? "none" : url("gold")}
            stroke={wavy ? url("gold") : "none"}
            strokeWidth="1.6"
            transform={`rotate(${i * 22.5} ${CX} ${CY})`}
          />
        );
      })}
      <circle cx={CX} cy={CY} r="30" fill={url("gold")} stroke="#5c420b" strokeWidth="1" />
      <circle cx={CX} cy={CY} r="24" fill="none" stroke="#fff3c4" strokeWidth="0.8" opacity="0.7" />
      <path d={ticks(CX, CY, 24, 29, 36)} stroke="#6e4f0e" strokeWidth="0.6" />
      <circle cx={CX} cy={CY} r="8" fill={url("jewel")} />
    </g>
  );
}

function MoonMotif({ url }: { url: Ids["url"] }) {
  return (
    <g>
      <circle cx={CX} cy={CY} r="46" fill="none" stroke={url("gold")} strokeWidth="0.8" strokeDasharray="0.1 3" strokeLinecap="round" />
      <path d={crescentPath(94, CY, 40, 0.5)} fill={url("gold")} stroke="#5c420b" strokeWidth="1" />
      <path d={crescentPath(94, CY, 33, 0.5)} fill="none" stroke="#fff3c4" strokeWidth="0.8" opacity="0.6" />
      {[
        [126, 128, 6],
        [134, 168, 4],
        [118, 190, 3],
      ].map(([x, y, r]) => (
        <path key={`${x}`} d={starPath(x, y, r, r * 0.38, 4)} fill="#fff6d5" />
      ))}
    </g>
  );
}

function StarMotif({ url }: { url: Ids["url"] }) {
  return (
    <g>
      <path d={starPath(CX, CY, 46, 14, 8)} fill={url("gold")} stroke="#5c420b" strokeWidth="1" />
      <path d={starPath(CX, CY, 30, 9, 8, -67.5)} fill="#fff6d5" opacity="0.65" />
      <circle cx={CX} cy={CY} r="6" fill={url("crystal")} />
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
        return <path key={i} d={starPath(r4(CX + 58 * Math.cos(a)), r4(CY + 58 * Math.sin(a)), 6, 2.2, 8)} fill={url("gold")} />;
      })}
    </g>
  );
}

function WheelMotif({ url }: { url: Ids["url"] }) {
  return (
    <g>
      <circle cx={CX} cy={CY} r="44" fill="none" stroke={url("gold")} strokeWidth="5" />
      <circle cx={CX} cy={CY} r="38" fill="none" stroke={url("goldV")} strokeWidth="1" />
      <path d={ticks(CX, CY, 12, 38, 8)} stroke={url("gold")} strokeWidth="2.4" />
      <path d={ticks(CX, CY, 44, 50, 8)} stroke={url("gold")} strokeWidth="3" strokeLinecap="round" />
      <circle cx={CX} cy={CY} r="12" fill={url("gold")} stroke="#5c420b" strokeWidth="0.8" />
      <circle cx={CX} cy={CY} r="4.5" fill={url("jewel")} />
    </g>
  );
}

/** Generic major arcana: all-seeing eye in a radiant triangle over a laurel. */
function MysticEye({ url }: { url: Ids["url"] }) {
  return (
    <g>
      <path d={ticks(CX, CY - 4, 40, 54, 24)} stroke={url("gold")} strokeWidth="0.9" strokeOpacity="0.75" />
      <path d="M100 110L138 176H62Z" fill="#1a1440" stroke={url("gold")} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M100 120L129 170H71Z" fill="none" stroke={url("goldV")} strokeWidth="0.7" />
      <path d="M78 152C86 141 94 137 100 137C106 137 114 141 122 152C114 163 106 167 100 167C94 167 86 163 78 152Z" fill="#f6efdc" stroke={url("gold")} strokeWidth="1.2" />
      <circle cx={CX} cy="152" r="8" fill={url("gold")} />
      <circle cx={CX} cy="152" r="3.5" fill="#0b0a12" />
      <circle cx="102.5" cy="149.5" r="1.3" fill="#ffffff" />
      {/* laurel branches cradling the triangle */}
      <path d="M100 206C84 204 70 196 64 182M100 206C116 204 130 196 136 182" fill="none" stroke={url("gold")} strokeWidth="1.3" />
      {[0, 1, 2, 3, 4].map((i) => {
        const t = i / 4;
        // points along each branch, leaves angled outward
        const lx = 66 + t * 30;
        const ly = r4(185 + Math.sin(t * Math.PI * 0.5) * 18);
        const rx = 200 - lx;
        return (
          <g key={i}>
            <path d={`M${lx} ${ly}c-6 -2 -9 -7 -8 -11c5 1 8 5 8 11z`} fill={url("gold")} />
            <path d={`M${lx} ${ly}c-2 4 -7 6 -11 5c2 -5 6 -6 11 -5z`} fill={url("goldV")} />
            <path d={`M${rx} ${ly}c6 -2 9 -7 8 -11c-5 1 -8 5 -8 11z`} fill={url("gold")} />
            <path d={`M${rx} ${ly}c2 4 7 6 11 5c-2 -5 -6 -6 -11 -5z`} fill={url("goldV")} />
          </g>
        );
      })}
      <circle cx="100" cy="206" r="2.4" fill={url("jewel")} />
    </g>
  );
}

function Motif({ card, url }: { card: Pick<TarotCardDef, "arcana" | "number" | "suit">; url: Ids["url"] }) {
  if (card.arcana === "minor") {
    switch (card.suit as Suit) {
      case "cups":
        return <Chalice url={url} />;
      case "wands":
        return <Wand url={url} />;
      case "swords":
        return <Sword url={url} />;
      default:
        return <Pentacle url={url} />;
    }
  }
  if (card.number === 19) return <SunMotif url={url} />;
  if (card.number === 18) return <MoonMotif url={url} />;
  if (card.number === 17) return <StarMotif url={url} />;
  if (card.number === 10) return <WheelMotif url={url} />;
  return <MysticEye url={url} />;
}

/* ---------- card face ---------- */

/** Face-up artwork. Reversed cards render upside down, as in a real spread. */
export function CardFace({
  card,
  reversed,
}: {
  card: Pick<TarotCardDef, "arcana" | "number" | "suit" | "nameEn">;
  reversed?: boolean;
}) {
  const ids = useIds();
  const { id, url } = ids;
  const label = cardCornerLabel(card);
  const title = card.nameEn.toUpperCase();
  // Ribbon text area is ~110 units wide; step the size down for longer names.
  const titleSize = title.length <= 9 ? 10.5 : title.length <= 13 ? 9.4 : 8.4;
  const titleSpacing = title.length <= 9 ? 1.6 : title.length <= 13 ? 0.9 : 0.3;
  const squeezeTitle = title.length > 15;

  return (
    <div className={`size-full ${reversed ? "rotate-180" : ""}`}>
      <svg viewBox="0 0 200 320" className="size-full" aria-hidden>
        <Defs id={id} variant="face" />
        <Frame ids={ids}>
          {/* medallion behind the symbol */}
          <circle cx={CX} cy={CY} r="70" fill={url("halo")} />
          <circle cx={CX} cy={CY} r="62" fill="none" stroke={url("gold")} strokeWidth="0.9" strokeOpacity="0.6" />
          <path d={ticks(CX, CY, 62, 67, 72)} stroke={url("gold")} strokeWidth="0.5" strokeOpacity="0.55" />
          <circle cx={CX} cy={CY} r="57" fill="none" stroke={url("gold")} strokeWidth="0.7" strokeDasharray="0.1 2.6" strokeLinecap="round" strokeOpacity="0.8" />
          <g filter={url("glow")}>
            <Motif card={card} url={url} />
          </g>
          {/* ornamental dividers above and below the medallion */}
          {[70, 244].map((y) => (
            <g key={y}>
              <path d={`M62 ${y}H90M110 ${y}H138`} stroke={url("gold")} strokeWidth="0.8" />
              <path d={`M100 ${y - 5}L105 ${y}L100 ${y + 5}L95 ${y}Z`} fill={url("gold")} />
              <circle cx="58" cy={y} r="1.4" fill={url("gold")} />
              <circle cx="142" cy={y} r="1.4" fill={url("gold")} />
              <path d={starPath(78, y - 0.2, 2.6, 0.8, 4)} fill="#fff6d5" opacity="0.8" />
              <path d={starPath(122, y - 0.2, 2.6, 0.8, 4)} fill="#fff6d5" opacity="0.8" />
            </g>
          ))}
        </Frame>

        {/* numeral cartouche */}
        <path d="M70 38L79 28H121L130 38L121 48H79Z" fill="#120e2c" stroke={url("gold")} strokeWidth="1.4" />
        <path d="M76 38L82 32H118L124 38L118 44H82Z" fill="none" stroke={url("goldV")} strokeWidth="0.6" strokeOpacity="0.7" />
        <path d={`M48 38H66M134 38H152`} stroke={url("gold")} strokeWidth="0.8" />
        <circle cx="46" cy="38" r="1.6" fill={url("gold")} />
        <circle cx="154" cy="38" r="1.6" fill={url("gold")} />
        <text x={CX} y="42.5" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="1" fill={url("goldV")} style={{ fontFamily: TITLE_FONT }}>
          {label}
        </text>

        {/* title ribbon */}
        <path d="M28 282L36 274L40 282L36 290Z" fill={url("gold")} opacity="0.85" />
        <path d="M172 282L164 274L160 282L164 290Z" fill={url("gold")} opacity="0.85" />
        <path d="M40 271H160L166 282L160 293H40L34 282Z" fill="#120e2c" stroke={url("gold")} strokeWidth="1.4" />
        <path d="M44 275H156M44 289H156" stroke={url("goldV")} strokeWidth="0.5" strokeOpacity="0.7" />
        <text
          x={CX}
          y="285.5"
          textAnchor="middle"
          fontSize={titleSize}
          fontWeight="700"
          letterSpacing={titleSpacing}
          fill={url("goldV")}
          style={{ fontFamily: TITLE_FONT }}
          {...(squeezeTitle ? { textLength: 108, lengthAdjust: "spacingAndGlyphs" } : {})}
        >
          {title}
        </text>
      </svg>
    </div>
  );
}
