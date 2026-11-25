/**
 * Looks and placement of the 3D power rings behind วงล้อไต่ชั้น (pure: no DOM, no three.js — unit tested). It reads only two facts the screen
 * already shows — whether the wheel is turning and how many levels are cleared; nothing here spins, climbs or pays anything.
 * Everything is centred on the wheel; distances are CSS pixels.
 */

export const LEVELS = 12;
/** At most ~30 drawn frames a second: the wheel's own animation needs the rest. */
export const MIN_FRAME_MS = 30;
/** The loop rests this long after the last scroll movement, so scrolling the page stays smooth. */
export const SCROLL_REST_MS = 180;
/** How far the layer reaches past the wheel box on each side (soft light only). */
export const GLOW_PAD = 40;

export type TowerLook = {
  /** Pace of the rings and motes. */
  speed: number;
  /** 0..1: stored power (cleared levels out of 12) — gold light and motes. */
  energy: number;
  /** 0..1: extra brightness while the wheel turns. */
  boost: number;
};

export const levelEnergy = (level: number) => Math.min(Math.max(level, 0), LEVELS) / LEVELS;

export function targetLook(spinning: boolean, level: number): TowerLook {
  return { speed: spinning ? 3.2 : 1 + levelEnergy(level) * 0.6, energy: levelEnergy(level), boost: spinning ? 1 : 0 };
}

const RATE: TowerLook = { speed: 1.8, energy: 1.6, boost: 3 };

/** Frame-rate independent easing: power fills up and drains smoothly. */
export function stepLook(current: TowerLook, target: TowerLook, dt: number): TowerLook {
  const ease = (key: keyof TowerLook) => current[key] + (target[key] - current[key]) * (1 - Math.exp(-RATE[key] * dt));
  return { speed: ease("speed"), energy: ease("energy"), boost: ease("boost") };
}

/** How lit tier `index` (0 = the lowest) is with `energy` of stored power: 1 = cleared, 0 = not yet, in between while filling. */
export const tierFill = (index: number, energy: number) => Math.min(Math.max(energy * LEVELS - index, 0), 1);

/** The wheel drawing's gold rim reaches this share of half the wheel box (207 of 240 in ClimbWheel's drawing). */
export const RIM_SHARE = 207 / 240;

export type Rings = {
  /** Outer edge of the wheel's gold rim. */
  rim: number;
  /** A hairline just outside the rim, the twelve-part level meter, and the outermost ring — all inside the wheel's own box. */
  hairline: number;
  meter: number;
  outer: number;
  /** Half the wheel box: nothing solid goes past this, so text and buttons around the box are never touched. */
  reach: number;
};

/** Radii in CSS pixels for a wheel box `wheelSize` pixels wide, all centred on the wheel. */
export function rings(wheelSize: number): Rings {
  const reach = wheelSize / 2;
  const rim = reach * RIM_SHARE;
  const room = reach - rim;
  return { rim, hairline: rim + room * 0.14, meter: rim + room * 0.48, outer: rim + room * 0.84, reach };
}

/** Gap between two parts of the level meter, radians. */
const GAP = 0.06;

/** Part `index` of the level meter as a torus arc (angles counter-clockwise from the right): part 0 starts at the top, going clockwise. */
export function segment(index: number): { start: number; sweep: number } {
  const step = (Math.PI * 2) / LEVELS;
  return { start: Math.PI / 2 - (index + 1) * step + GAP / 2, sweep: step - GAP };
}
