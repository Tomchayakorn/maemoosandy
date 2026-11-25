import { describe, expect, it } from "vitest";
import { LEVELS, MIN_FRAME_MS, rings, segment, stepLook, targetLook, tierFill } from "./mood";

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
  it("keeps every ring between the wheel's rim and the edge of the wheel box, at phone and desktop sizes", () => {
    for (const size of [288, 328, 336]) {
      const r = rings(size);
      expect(r.reach).toBe(size / 2);
      expect(r.rim).toBeLessThan(r.hairline);
      expect(r.hairline).toBeLessThan(r.meter);
      expect(r.meter).toBeLessThan(r.outer);
      expect(r.outer).toBeLessThanOrEqual(r.reach - 2);
    }
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
  });
  it("lays the twelve meter parts clockwise from the top with small gaps", () => {
    const mid = (i: number) => segment(i).start + segment(i).sweep / 2;
    expect(mid(0)).toBeCloseTo((75 * Math.PI) / 180, 6); // just right of the top
    expect(mid(3)).toBeCloseTo((-15 * Math.PI) / 180, 6); // just below the right side
    for (let i = 1; i < LEVELS; i++) {
      expect(segment(i).start + segment(i).sweep).toBeLessThan(segment(i - 1).start);
      expect(mid(i - 1) - mid(i)).toBeCloseTo(Math.PI / 6, 6);
    }
  });
});
