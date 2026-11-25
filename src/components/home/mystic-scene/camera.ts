/**
 * Camera and render-quality math of the home page's 3D backdrop (pure: no DOM, no three.js — unit tested).
 *
 * The camera sways slowly around the crystal ball and looks above it, so the shrine sits in the lower part of the screen, under the title.
 * Tall (phone) screens stand further back, look higher still and look down slightly more.
 */

export const TARGET_HEIGHT = 1.55;
/** Vertical field of view of the camera, degrees. */
export const FOV = 40;
/** Where the logo's centre sits on a phone when it cannot be measured (px from the top of the page). */
export const LOGO_CENTER_FALLBACK_PX = 224;

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

/**
 * The height at which a point on the scene's centre line (x = 0, z = 0) appears at `ndcY` on screen (1 = top edge, 0 = middle, −1 = bottom),
 * for a camera at `eye` looking at height `lookY`. Used to hang the crystal ball exactly behind the logo, whatever the screen size.
 */
export function heightAtScreen(eye: { x: number; y: number; z: number }, lookY: number, ndcY: number, fov = FOV): number {
  // camera axes: forward towards the look-at point, up perpendicular to it in the vertical plane
  const flat = Math.hypot(eye.x, eye.z);
  const rise = lookY - eye.y;
  const length = Math.hypot(flat, rise);
  const fy = rise / length;
  const fFlat = -flat / length; // along the horizontal direction pointing from the centre line to the camera
  const uy = -fFlat;
  const uFlat = fy;
  const k = ndcY * Math.tan((fov * Math.PI) / 360);
  // the point (0, y, 0) seen from the camera: horizontal offset −flat, vertical offset y − eye.y
  const up = -flat * uFlat - eye.y * uy;
  const forward = -flat * fFlat - eye.y * fy;
  return (k * forward - up) / (uy - k * fy);
}

/** Render resolution of the backdrop (it sits dimmed behind the page): at most 1.25 on phones, 1.5 on larger screens; 1 when slow. */
export function pixelRatioFor(devicePixelRatio: number, width: number, slow = false): number {
  if (slow) return 1;
  return clamp(devicePixelRatio || 1, 1, width < 600 ? 1.25 : 1.5);
}
