/**
 * Moods, bell swing and placement of the 3D lucky shrine behind น้องเหมียว 9 ชีวิต (pure: no DOM, no three.js — unit tested). It reads only two
 * facts the page already shows (a cat is being drawn; coins were won); nothing here draws a reward or touches the daily chance.
 */
export type ShrineMood = "idle" | "picking" | "won";

export type ShrineLook = {
  /** 0..1: strength of the light waves spreading from the board. */
  wave: number;
  /** 0..1.5: brightness of the lanterns and the glow behind the board. */
  glow: number;
};

/** How long the shrine celebrates a win. */
export const CELEBRATE_MS = 4500;
/** The loop rests this long after the last scroll movement, so scrolling the page stays smooth. */
export const SCROLL_REST_MS = 180;
/** At most ~30 drawn frames a second. */
export const MIN_FRAME_MS = 30;

export const MOOD_LOOK: Record<ShrineMood, ShrineLook> = {
  idle: { wave: 0, glow: 0.5 },
  picking: { wave: 1, glow: 1 },
  won: { wave: 0.85, glow: 1.25 },
};
/** How hard each mood strikes the bells when it begins. */
export const KICK: Record<ShrineMood, number> = { idle: 0, picking: 1, won: 1.2 };

export function moodOf(state: { picking: boolean; celebrating: boolean }): ShrineMood {
  if (state.picking) return "picking";
  return state.celebrating ? "won" : "idle";
}

/** Frame-rate independent easing towards the mood's look. */
export function stepLook(current: ShrineLook, target: ShrineLook, dt: number): ShrineLook {
  const ease = (key: keyof ShrineLook, rate: number) => current[key] + (target[key] - current[key]) * (1 - Math.exp(-rate * dt));
  return { wave: ease("wave", 3), glow: ease("glow", 2.2) };
}

/**
 * Angle of a hanging bell or lantern, radians: a gentle idle sway plus a swing struck `age` seconds ago that dies away like a pendulum.
 */
export function swing(time: number, phase: number, age: number, strength: number): number {
  const idle = 0.05 * Math.sin(time * 1.5 + phase);
  if (age < 0 || !Number.isFinite(age)) return idle;
  // eases in over the first moment, so the strike never snaps
  return idle + strength * 0.5 * (1 - Math.exp(-age * 9)) * Math.exp(-age * 0.8) * Math.sin(age * 5.6 + phase * 0.4);
}

/** Half-width the page title may cover, CSS pixels: lanterns stay outside it. */
export const TITLE_HALF = 134;
/** How far above the page header the layer begins. */
export const ABOVE_HEADER = 30;
/** How far below the board it ends. */
export const BELOW_BOARD = 60;

export type Layout = {
  beamY: number;
  /** Posts of the gate, in the page's side margins. */
  postX: number;
  postBottom: number;
  /** Centre of the board, from the top of the layer. */
  centreY: number;
  boardHalf: number;
  lanterns: { x: number; y: number; width: number }[];
  /** Bells: where the cord is tied, the cord length and the bell size. x is from the centre line, y from the top of the layer. */
  bells: { x: number; y: number; cord: number; size: number }[];
};

/** Everything in CSS pixels; `width` is the layer's width, `board` its position inside the layer. */
export function layout(width: number, board: { top: number; height: number }): Layout {
  const half = width / 2;
  const lanternWidth = Math.min(Math.max(half - TITLE_HALF, 12), 30);
  const beamY = 12;
  const sides = [-1, 1] as const;
  return {
    beamY,
    postX: half - 6,
    postBottom: board.top + board.height + 36,
    centreY: board.top + board.height / 2,
    boardHalf: board.height / 2,
    lanterns: sides.map((s) => ({ x: s * (half - 6 - lanternWidth / 2), y: 70, width: lanternWidth })),
    bells: [
      // under the beam, either side of the small heading
      ...sides.map((s) => ({ x: s * Math.max(half - 62, 112), y: beamY + 4, cord: 6, size: 12 })),
      // on the posts, beside the top of the board
      ...sides.map((s) => ({ x: s * (half - 8), y: board.top - 28, cord: 8, size: 10 })),
    ],
  };
}
