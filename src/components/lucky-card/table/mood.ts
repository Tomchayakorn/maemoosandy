/**
 * How the 3D table behind the lucky cards behaves (pure: no DOM, no three.js — unit tested). It reads only the screen's phase and the kind of
 * result already shown; nothing here draws, chooses or changes a card, a prize or coins.
 */
export type TableMood = "idle" | "opening" | "special" | "calm";

export type TableLook = {
  /** Pace of the rings, dust and flames. */
  speed: number;
  /** 0..1.5: candle light, rings and gold. */
  glow: number;
  /** 0..1: the sparkle burst of a special prize. */
  burst: number;
};

/** How long the sparkles of a special prize last; the warmer light stays while the result is on screen. */
export const CELEBRATE_MS = 4500;
/** The loop rests this long after the last scroll movement, so scrolling the page stays smooth. */
export const SCROLL_REST_MS = 180;
/** At most ~30 drawn frames a second. */
export const MIN_FRAME_MS = 30;
/** Height of the layer, centred on the card board (or on the result card), CSS pixels. */
export const LAYER_HEIGHT = 520;

export const MOOD_LOOK: Record<TableMood, TableLook> = {
  idle: { speed: 1, glow: 0.5, burst: 0 },
  opening: { speed: 2.6, glow: 1.1, burst: 0 },
  special: { speed: 1.4, glow: 1.25, burst: 1 },
  calm: { speed: 0.7, glow: 0.4, burst: 0 },
};

/** A bonus or the secret prize is "special"; a fortune message is not. */
export function moodOf(phase: "pick" | "loading" | "result", outcome?: "message" | "bonus" | "secret"): TableMood {
  if (phase === "pick") return "idle";
  if (phase === "loading") return "opening";
  return outcome === "bonus" || outcome === "secret" ? "special" : "calm";
}

const RATE: TableLook = { speed: 1.8, glow: 2.2, burst: 2.8 };

/** Frame-rate independent easing towards the mood's look. */
export function stepLook(current: TableLook, target: TableLook, dt: number): TableLook {
  const ease = (key: keyof TableLook) => current[key] + (target[key] - current[key]) * (1 - Math.exp(-RATE[key] * dt));
  return { speed: ease("speed"), glow: ease("glow"), burst: ease("burst") };
}
