import { describe, expect, it } from "vitest";
import { EDGE_GAP, layout, LEVELS, MIN_FRAME_MS, stepLook, targetLook, tierFill } from "./mood";

describe("power wheel tower", () => {
  it("fills one tier per cleared level and spins up only while the wheel turns", () => {
    const at = targetLook(false, 3);
    expect(Array.from({ length: LEVELS }, (_, i) => tierFill(i, at.energy))).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(targetLook(false, 0).energy).toBe(0);
    expect(targetLook(false, 99).energy).toBe(1);
    expect(targetLook(true, 3).speed).toBeGreaterThan(at.speed * 2);
    expect(targetLook(true, 3).boost).toBe(1);
    expect(at.boost).toBe(0);
  });
  it("charges and drains smoothly", () => {
    let look = targetLook(false, 0);
    const first = stepLook(look, targetLook(false, 12), 1 / 30);
    expect(first.energy).toBeLessThan(0.08);
    for (let i = 0; i < 150; i++) look = stepLook(look, targetLook(false, 12), 1 / 30);
    expect(look.energy).toBeCloseTo(1, 2);
  });
  it("never crowds the screen edges, on narrow phones or wide screens", () => {
    for (const [w, h] of [[320, 568], [375, 812], [430, 932], [768, 1024], [1440, 900]]) {
      const wheel = { centre: h * 0.6, radius: Math.min(w - 32, 336) / 2 };
      const l = layout(w, h, wheel);
      const wheelTop = h / 2 - (wheel.centre - wheel.radius); // in the same upward coordinates
      expect(l.tiers).toHaveLength(LEVELS);
      for (const t of l.tiers) {
        expect(t.radius).toBeLessThanOrEqual(w / 2 - EDGE_GAP);
        expect(Math.abs(t.y)).toBeLessThan(h / 2);
        expect(t.y).toBeLessThan(wheelTop); // the text above the wheel is never crossed
      }
      for (const r of l.halo.radii) expect(r).toBeLessThanOrEqual(w / 2 - EDGE_GAP);
      expect(l.tiers[11].y).toBeGreaterThan(l.tiers[0].y);
    }
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
  });
});
