/**
 * Camera and render-quality math of the home page's 3D backdrop (pure: no DOM, no three.js — unit tested).
 *
 * The camera sways slowly around the crystal ball and looks above it, so the shrine sits in the lower part of the screen, under the title.
 * Tall (phone) screens stand further back, look higher still and look down slightly more.
 */

export const TARGET_HEIGHT = 1.55;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 0 for a wide screen (aspect ≥ 1.2), 1 for a tall phone screen (aspect ≤ 0.6), smooth in between. */
export function tallness(aspect: number): number {
  const u = clamp((1.2 - aspect) / 0.6, 0, 1);
  return u * u * (3 - 2 * u);
}

/** Distance from the ball. */
export function cameraDistance(aspect: number): number {
  return clamp(12 / Math.max(aspect, 0.3) ** 0.55, 8.2, 18);
}

/** The height the camera looks at. */
export function lookAtHeight(aspect: number): number {
  return 3.1 + tallness(aspect) * 1.5;
}

/** Camera position at scene time `t` (seconds). */
export function orbitPose(t: number, aspect: number): { x: number; y: number; z: number } {
  const yaw = Math.sin(t * 0.1) * 0.5;
  const pitch = 0.17 + tallness(aspect) * 0.1 + Math.sin(t * 0.075 + 1.3) * 0.05;
  const r = cameraDistance(aspect) + Math.sin(t * 0.06) * 0.3;
  return {
    x: Math.sin(yaw) * Math.cos(pitch) * r,
    y: TARGET_HEIGHT + Math.sin(pitch) * r,
    z: Math.cos(yaw) * Math.cos(pitch) * r,
  };
}

/** Render resolution of the backdrop (it sits dimmed behind the page): at most 1.25 on phones, 1.5 on larger screens; 1 when slow. */
export function pixelRatioFor(devicePixelRatio: number, width: number, slow = false): number {
  if (slow) return 1;
  return clamp(devicePixelRatio || 1, 1, width < 600 ? 1.25 : 1.5);
}
