/**
 * How the 3D altar behind the lucky wheel behaves (pure: no DOM, no three.js — unit tested). It only reads three booleans of the page;
 * nothing here draws, changes or knows about a prize, coins or spin rights.
 */
export type AltarMood = "idle" | "spinning" | "covered" | "win";

export type AltarLook = {
  /** Pace of the coins, rays and dust. */
  speed: number;
  /** 0..1.5: brightness of the light pillars, rays and gold. */
  glow: number;
  /** 0..1: strength of the winning sparkle burst. */
  burst: number;
};

/** How long the celebration lasts once the result window of a winning spin is closed. */
export const CELEBRATE_MS = 4500;
/** The loop rests this long after the last scroll movement, so scrolling the page stays smooth. */
export const SCROLL_REST_MS = 180;
/** At most ~30 drawn frames a second: the wheel and its spin effects need the rest of the frame budget. */
export const MIN_FRAME_MS = 30;

export const MOOD_LOOK: Record<AltarMood, AltarLook> = {
  idle: { speed: 1, glow: 0.45, burst: 0 },
  spinning: { speed: 3.6, glow: 1.15, burst: 0 },
  covered: { speed: 1, glow: 0.45, burst: 0 },
  win: { speed: 1.7, glow: 1.35, burst: 1 },
};

export function moodOf(state: { spinning: boolean; resultOpen: boolean; celebrating: boolean }): AltarMood {
  if (state.spinning) return "spinning";
  if (state.resultOpen) return "covered"; // the result window hides the page: nothing worth drawing
  return state.celebrating ? "win" : "idle";
}

const RATE: AltarLook = { speed: 2, glow: 2.4, burst: 3 };

/** Frame-rate independent easing towards the mood's look. */
export function stepLook(current: AltarLook, target: AltarLook, dt: number): AltarLook {
  const ease = (key: keyof AltarLook) => current[key] + (target[key] - current[key]) * (1 - Math.exp(-RATE[key] * dt));
  return { speed: ease("speed"), glow: ease("glow"), burst: ease("burst") };
}

/** Room the layer takes above and below the wheel's box, CSS pixels. */
export const LAYER_ABOVE = 72;
export const LAYER_BELOW = 150;
