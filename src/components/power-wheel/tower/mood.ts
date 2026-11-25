/**
 * Looks and placement of the 3D power tower behind วงล้อไต่ชั้น (pure: no DOM, no three.js — unit tested). It reads only two facts the screen
 * already shows — whether the wheel is turning and how many levels are cleared; nothing here spins, climbs or pays anything.
 * Coordinates are CSS pixels from the middle of the screen, y upwards.
 */

export const LEVELS = 12;
/** At most ~30 drawn frames a second: the wheel's own animation needs the rest. */
export const MIN_FRAME_MS = 30;
/** Nothing solid comes closer to a screen edge than this. */
export const EDGE_GAP = 12;
/** Widest half-size of the composition on large screens. */
const MAX_HALF = 300;

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

export type Layout = {
  /** Twelve flat rings climbing from the foot of the screen to the wheel — never above it, where the title and text are. */
  tiers: { y: number; radius: number }[];
  /** Round rings around the wheel's resting place. */
  halo: { y: number; radii: number[] };
};

/** `wheel`: where the wheel's centre rests (from the top of the screen) and its radius, CSS pixels. */
export function layout(width: number, height: number, wheel: { centre: number; radius: number }): Layout {
  const half = Math.min(width / 2 - EDGE_GAP, MAX_HALF);
  const y = height / 2 - Math.min(Math.max(wheel.centre, height * 0.3), height * 0.75);
  const radii = [1.1, 1.2, 1.32].map((k, n) => Math.min(wheel.radius * k, half - (2 - n) * 7));
  const bottom = -height * 0.47;
  // the highest tier stays a little under the wheel's top edge
  const top = Math.max(y + wheel.radius * 0.8, bottom + height * 0.25);
  const tiers = Array.from({ length: LEVELS }, (_, n) => {
    const u = n / (LEVELS - 1);
    return { y: bottom + u * (top - bottom), radius: half * (1 - 0.1 * u) };
  });
  return { tiers, halo: { y, radii } };
}
