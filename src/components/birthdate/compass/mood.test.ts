import { describe, expect, it } from "vitest";
import { anchors, minFrameMs, MOOD_LOOK, ringRadius, stepLook } from "./mood";

describe("birth-date compass moods", () => {
  it("spins faster and glows brighter while the reading is being decoded, calmest when reading it", () => {
    expect(MOOD_LOOK.loading.speed).toBeGreaterThan(MOOD_LOOK.form.speed * 3);
    expect(MOOD_LOOK.loading.glow).toBeGreaterThan(MOOD_LOOK.form.glow);
    expect(MOOD_LOOK.result.glow).toBeLessThan(MOOD_LOOK.form.glow);
  });
  it("winds up gently and arrives", () => {
    let look = MOOD_LOOK.form;
    const first = stepLook(look, MOOD_LOOK.loading, 1 / 60);
    expect(first.speed - look.speed).toBeLessThan(0.15);
    for (let i = 0; i < 300; i++) look = stepLook(look, MOOD_LOOK.loading, 1 / 60);
    expect(look.speed).toBeCloseTo(MOOD_LOOK.loading.speed, 1);
    expect(look.gather).toBeCloseTo(1, 2);
    expect(stepLook(look, MOOD_LOOK.form, 0)).toEqual(look);
  });
  it("draws faster only while loading and keeps the rings inside narrow screens", () => {
    expect(minFrameMs("loading")).toBeLessThan(minFrameMs("form"));
    expect(ringRadius(320) * 2).toBeLessThan(320);
    expect(ringRadius(448)).toBe(175);
  });
  it("hangs apart around the form and together on the crystal ball", () => {
    const m = { spacer: { top: 150, height: 240 }, ball: 360 };
    const apart = anchors(m, 0);
    expect(apart.halo).toBeLessThan(apart.compass);
    expect(anchors(m, 1)).toEqual({ halo: 360, compass: 360 });
    expect(anchors({ spacer: null, ball: null }, 1).halo).toBeGreaterThan(0);
  });
});
