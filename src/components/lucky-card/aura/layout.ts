/**
 * Composition of ดวงดี มีเฮ's "lucky aura and gold dust" backdrop for a screen of any shape (pure: no DOM, no three.js — unit tested).
 * Coordinates are CSS pixels from the middle of the screen, y upwards. Everything is soft light and tiny specks: nothing frames the screen,
 * the solid flakes keep to the top, the bottom and the far edges, and the dust dims over the middle where the cards and text are.
 */

/** At most ~30 drawn frames a second. */
export const MIN_FRAME_MS = 30;

export type Aura = { x: number; y: number; size: number; color: number; opacity: number; phase: number };
export type Arc = { y: number; radius: number; width: number; from: number; sweep: number; color: number; opacity: number; spin: number };
export type Speck = { x: number; y: number; z: number; size: number; speed: number; phase: number; gold: number };
export type Flake = { x: number; y: number; z: number; size: number; phase: number };

export type Composition = { auras: Aura[]; arcs: Arc[]; dust: Speck[]; bokeh: Speck[]; flakes: Flake[] };

/** Deterministic pseudo-random numbers, so the sky looks the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The part of the screen (as shares of the half width / half height) where cards and text are read. */
export const inMiddle = (x: number, y: number, width: number, height: number) => Math.abs(x) < width * 0.36 && Math.abs(y) < height * 0.31;

export function composition(width: number, height: number): Composition {
  const halfW = width / 2;
  const halfH = height / 2;
  const span = Math.max(width, height * 0.62);
  const area = clamp((width * height) / (390 * 844), 0.7, 2.2);

  const aura = (x: number, y: number, size: number, color: number, opacity: number, phase: number): Aura => ({ x: halfW * x, y: halfH * y, size: span * size, color, opacity, phase });
  const auras = [
    aura(-0.75, 0.62, 1.35, 0x7c3aed, 0.3, 0),
    aura(0.82, 0.1, 1.15, 0x9333ea, 0.2, 1.7),
    aura(-0.55, -0.55, 1.2, 0x6d28d9, 0.24, 3.1),
    aura(0.45, -0.82, 1.1, 0xd4a017, 0.17, 4.4),
    aura(0.1, 0.86, 0.75, 0xe7b84a, 0.1, 5.3),
  ];

  // wide, faint halos rising from below the screen and falling from above it
  const arc = (y: number, radius: number, width_: number, from: number, sweep: number, color: number, opacity: number, spin: number): Arc => ({ y: halfH * y, radius: height * radius, width: width_, from, sweep, color, opacity, spin });
  const arcs = [
    arc(-1.3, 0.34, 1.4, 0.05, 0.9, 0xf3d98b, 0.3, 0.05),
    arc(-1.3, 0.4, 0.9, 0.2, 0.6, 0xa78bfa, 0.28, -0.04),
    arc(-1.3, 0.47, 0.7, 0.0, 1.0, 0xf3d98b, 0.14, 0.03),
    arc(1.34, 0.28, 1.1, 1.08, 0.84, 0xf3d98b, 0.2, -0.045),
    arc(1.34, 0.35, 0.7, 1.2, 0.6, 0xa78bfa, 0.2, 0.035),
  ];

  const random = seeded(5151);
  const speck = (size: number, spread: number, speed: number): Speck => ({
    x: (random() - 0.5) * width,
    y: (random() - 0.5) * height,
    z: -random() * 220,
    size: size + random() * spread,
    speed: speed * (0.5 + random()),
    phase: random() * Math.PI * 2,
    gold: random(),
  });
  const dust = Array.from({ length: Math.round(110 * area) }, () => speck(3, 6, 9));
  const bokeh = Array.from({ length: Math.round(14 * area) }, () => speck(18, 26, 4));

  const flakes: Flake[] = [];
  const wanted = Math.round(14 * area);
  while (flakes.length < wanted) {
    const x = (random() - 0.5) * (width - 12);
    const y = (random() - 0.5) * (height - 12);
    if (!inMiddle(x, y, width, height)) flakes.push({ x, y, z: -random() * 120, size: 2.2 + random() * 2.6, phase: random() * Math.PI * 2 });
  }

  return { auras, arcs, dust, bokeh, flakes };
}
