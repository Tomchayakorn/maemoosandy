/**
 * Looks and placement of the 3D light behind the จับคู่ภาพเหมือน board (pure: no DOM, no three.js — unit tested). Purely decorative: it knows
 * the size of the board and nothing about the game. Everything is centred on the board; distances are CSS pixels.
 */

/** How far the layer reaches past the board above and below, and at each side (it is never wider than the screen). */
export const PAD_X = 28;
export const PAD_Y = 76;
/** At most ~30 drawn frames a second. */
export const MIN_FRAME_MS = 30;
/** The loop rests this long after the last scroll movement, so scrolling the page stays smooth. */
export const SCROLL_REST_MS = 180;
/** Motes of gold dust. */
export const MOTES = 64;

export type Ring = {
  /** Half width and half height of the oval. */
  rx: number;
  ry: number;
  /** Thickness of the ring (radius of the tube). */
  tube: number;
  color: number;
  /** Brightness of the whole ring, and of the light gliding along it. */
  base: number;
  shine: number;
  /** Turns per second of the gliding light (negative = the other way), and where it starts (0..1). */
  pace: number;
  phase: number;
};

const CHAMPAGNE = 0xf6dfa6;
const VIOLET = 0x9d6bff;
const GOLD = 0xe9bd55;

/**
 * Three round ovals around the board. Their tops and bottoms rise above and below it, their sides stay just inside the layer; the corners pass
 * behind the board. No ring reaches past the layer, so nothing is ever clipped.
 */
export function rings(width: number, height: number): Ring[] {
  const rx = width / 2;
  const ry = height / 2;
  const fit = (r: number, margin: number) => Math.max(r - margin, 1);
  return [
    { rx: fit(rx, 4), ry: fit(ry, PAD_Y * 0.62), tube: 0.9, color: CHAMPAGNE, base: 0.2, shine: 0.75, pace: 0.055, phase: 0 },
    { rx: fit(rx, 11), ry: fit(ry, PAD_Y * 0.34), tube: 2.4, color: VIOLET, base: 0.16, shine: 0.45, pace: -0.038, phase: 0.4 },
    { rx: fit(rx, 2), ry: fit(ry, PAD_Y * 0.1), tube: 0.7, color: GOLD, base: 0.12, shine: 0.55, pace: 0.028, phase: 0.72 },
  ];
}
