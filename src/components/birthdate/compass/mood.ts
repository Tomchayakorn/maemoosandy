/**
 * How the 3D compass behind the birth-date page behaves in each state of the page (pure: no DOM, no three.js — unit tested).
 * It only reads the page's phase; nothing here touches the reading, coins or form.
 */
export type CompassMood = "form" | "loading" | "result" | "error";

export type CompassLook = {
  /** Spin multiplier. */
  speed: number;
  /** 0..1.5: brightness of the golden light and glows. */
  glow: number;
  /** 0 = zodiac halo and compass apart (around the portrait / on the card edge), 1 = both centred on one point (around the crystal ball). */
  gather: number;
};

export const MOOD_LOOK: Record<CompassMood, CompassLook> = {
  form: { speed: 1, glow: 0.55, gather: 0 },
  loading: { speed: 4.5, glow: 1.35, gather: 1 },
  result: { speed: 0.45, glow: 0.3, gather: 0 },
  error: { speed: 0.35, glow: 0.3, gather: 1 },
};

/** How fast each value approaches its target, per second: the spin winds up and down gently. */
const RATE: CompassLook = { speed: 1.6, glow: 2.2, gather: 2.6 };

/** Frame-rate independent easing of the current look towards the target. */
export function stepLook(current: CompassLook, target: CompassLook, dt: number): CompassLook {
  const ease = (key: keyof CompassLook) => current[key] + (target[key] - current[key]) * (1 - Math.exp(-RATE[key] * dt));
  return { speed: ease("speed"), glow: ease("glow"), gather: ease("gather") };
}

/** Shortest time between drawn frames: ~30 fps while the visitor types or reads, ~60 fps while the reading is being decoded. */
export function minFrameMs(mood: CompassMood): number {
  return mood === "loading" ? 10.5 : 30;
}

/** Ring radius in CSS pixels for a layer of this width. */
export function ringRadius(width: number): number {
  return Math.min(width * 0.44, 175);
}

/** Positions measured on the page, in CSS pixels from the top of the layer (null when that part isn't on screen). */
export type Measured = {
  /** The empty space above the form, where the room's portrait shows. */
  spacer: { top: number; height: number } | null;
  /** Centre of the loading crystal ball. */
  ball: number | null;
};

const FALLBACK = { halo: 270, compass: 390, centre: 340 };

/** Where the zodiac halo and the taksa compass hang: apart for the form, together (`gather`) round the crystal ball. */
export function anchors(m: Measured, gather: number): { halo: number; compass: number } {
  const halo = m.spacer ? m.spacer.top + m.spacer.height * 0.55 : FALLBACK.halo;
  const compass = m.spacer ? m.spacer.top + m.spacer.height * 0.98 : FALLBACK.compass;
  const centre = m.ball ?? FALLBACK.centre;
  return { halo: halo + (centre - halo) * gather, compass: compass + (centre - compass) * gather };
}
