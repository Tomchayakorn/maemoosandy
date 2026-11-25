import { describe, expect, it } from "vitest";
import { composition, inMiddle, MIN_FRAME_MS } from "./layout";

const SCREENS: [number, number][] = [[320, 568], [375, 812], [430, 932], [768, 1024], [1440, 900], [1920, 1080]];

describe("lucky aura composition", () => {
  it("keeps the solid flakes away from the middle, where the cards and text are", () => {
    for (const [w, h] of SCREENS) {
      const { flakes } = composition(w, h);
      expect(flakes.length).toBeGreaterThan(5);
      for (const f of flakes) {
        expect(inMiddle(f.x, f.y, w, h)).toBe(false);
        expect(Math.abs(f.x)).toBeLessThanOrEqual(w / 2);
        expect(Math.abs(f.y)).toBeLessThanOrEqual(h / 2);
        expect(f.size).toBeLessThan(6);
      }
    }
  });
  it("keeps the halos to the top and bottom bands and the light soft", () => {
    for (const [w, h] of SCREENS) {
      const { arcs, auras } = composition(w, h);
      for (const a of arcs) expect(Math.abs(a.y) - a.radius).toBeGreaterThan(h * 0.14);
      for (const a of auras) expect(a.opacity).toBeLessThanOrEqual(0.3);
    }
  });
  it("is the same on every visit, scales with the screen within limits, and stays at 30 fps or less", () => {
    expect(composition(375, 812)).toEqual(composition(375, 812));
    const phone = composition(375, 812).dust.length;
    const wide = composition(1920, 1080).dust.length;
    expect(wide).toBeGreaterThan(phone);
    expect(wide).toBeLessThanOrEqual(250);
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
  });
});
