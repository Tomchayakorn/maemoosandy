import { useId } from "react";

/** The six auspicious symbols, drawn in code (viewBox 100×100). Each has its own shape AND colour so pairs are easy to tell apart. */

function Lotus({ id }: { id: string }) {
  const petal = "M50 22 C62 36 62 54 50 70 C38 54 38 36 50 22 Z";
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9ec" />
          <stop offset="1" stopColor="#e0499a" />
        </linearGradient>
      </defs>
      {[-72, 72, -40, 40, 0].map((a) => (
        <path key={a} d={petal} transform={`rotate(${a} 50 70)`} fill={`url(#${id})`} stroke="#fff0f7" strokeWidth="1.4" opacity={Math.abs(a) > 50 ? 0.85 : 1} />
      ))}
      <path d="M18 74 Q50 94 82 74 Q66 80 50 80 Q34 80 18 74 Z" fill="#5fd0a0" />
    </>
  );
}

function Moon({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4fbff" />
          <stop offset="1" stopColor="#6ba8f5" />
        </linearGradient>
      </defs>
      <path d="M62 12 A39 39 0 1 0 86 68 A32 32 0 0 1 62 12 Z" fill={`url(#${id})`} stroke="#eaf5ff" strokeWidth="1.5" />
      <path d="M74 24 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" fill="#eaf5ff" />
    </>
  );
}

function Star({ id }: { id: string }) {
  // 8 points: long and short alternating
  const points = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 ? 15 : i % 4 ? 30 : 42;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.55" stopColor="#ffd54a" />
          <stop offset="1" stopColor="#d98e12" />
        </radialGradient>
      </defs>
      <polygon points={points} fill={`url(#${id})`} stroke="#fff3c4" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="7" fill="#fffdf0" />
    </>
  );
}

function Orb({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={id} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#c9a2ff" />
          <stop offset="1" stopColor="#5a22b8" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="44" r="30" fill={`url(#${id})`} stroke="#e5d4ff" strokeWidth="1.5" />
      <path d="M34 52 Q50 62 68 46" fill="none" stroke="#f0e6ff" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <path d="M28 72 H72 L80 88 H20 Z" fill="#d4af37" stroke="#f3d98b" strokeWidth="1.5" strokeLinejoin="round" />
      <ellipse cx="50" cy="72" rx="22" ry="5" fill="#f3d98b" />
    </>
  );
}

function Candle({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.65" r="0.6">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.45" stopColor="#ffab2e" />
          <stop offset="1" stopColor="#e8431f" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="26" r="22" fill="#ff8a2a" opacity="0.18" />
      <path d="M50 7 C64 24 63 40 50 43 C37 40 36 24 50 7 Z" fill={`url(#${id})`} />
      <path d="M50 43 V50" stroke="#3b2a1a" strokeWidth="2.5" />
      <rect x="37" y="49" width="26" height="36" rx="4" fill="#fdf1da" stroke="#e8cf9c" strokeWidth="1.5" />
      <path d="M37 55 Q43 55 43 66 Q43 70 46 70 Q49 70 48 62 Q48 55 55 55 L63 55 V53 Q63 49 59 49 H41 Q37 49 37 53 Z" fill="#f3dcae" />
      <path d="M24 85 H76 Q72 94 50 94 Q28 94 24 85 Z" fill="#d4af37" />
    </>
  );
}

function Bell({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d8fff0" />
          <stop offset="0.5" stopColor="#35cfa0" />
          <stop offset="1" stopColor="#0e7a63" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="13" r="7" fill="none" stroke="#7ff0c8" strokeWidth="4" />
      <path d="M50 20 C31 20 29 40 28 54 C27 66 22 70 18 74 H82 C78 70 73 66 72 54 C71 40 69 20 50 20 Z" fill={`url(#${id})`} stroke="#c8ffea" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="15" y="73" width="70" height="7" rx="3.5" fill="#7ff0c8" />
      <circle cx="50" cy="86" r="7" fill="#35cfa0" stroke="#c8ffea" strokeWidth="1.5" />
      <path d="M37 40 Q38 31 45 28" fill="none" stroke="#f0fff9" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

const ART = [Lotus, Moon, Star, Orb, Candle, Bell];

export function SymbolArt({ symbol, className }: { symbol: number; className?: string }) {
  const id = useId();
  const Art = ART[symbol];
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden data-symbol={symbol}>
      {Art && <Art id={`mg${id}`} />}
    </svg>
  );
}
