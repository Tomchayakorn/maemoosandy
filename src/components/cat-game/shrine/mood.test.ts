import { describe, expect, it } from "vitest";
import { layout, MIN_FRAME_MS, MOOD_LOOK, moodOf, stepLook, swing, TITLE_HALF } from "./mood";

describe("lucky cat shrine", () => {
  it("is calm until a cat is tapped, then celebrates only when told coins were won", () => {
    expect(moodOf({ picking: false, celebrating: false })).toBe("idle");
    expect(moodOf({ picking: true, celebrating: true })).toBe("picking");
    expect(moodOf({ picking: false, celebrating: true })).toBe("won");
    expect(MOOD_LOOK.idle.wave).toBe(0);
    let look = MOOD_LOOK.idle;
    expect(stepLook(look, MOOD_LOOK.picking, 1 / 30).wave).toBeLessThan(0.15);
    for (let i = 0; i < 90; i++) look = stepLook(look, MOOD_LOOK.picking, 1 / 30);
    expect(look.wave).toBeCloseTo(1, 2);
  });
  it("swings the bells hard after a strike, without a snap, and settles again", () => {
    const peak = (from: number, to: number) => {
      let max = 0;
      for (let a = from; a < to; a += 0.02) max = Math.max(max, Math.abs(swing(a, 0, a, 1)));
      return max;
    };
    expect(Math.abs(swing(0.001, 0, 0.001, 1) - swing(0.001, 0, Infinity, 1))).toBeLessThan(0.02);
    expect(peak(0, 1)).toBeGreaterThan(0.2);
    expect(peak(0, 1)).toBeLessThan(0.55);
    expect(peak(6, 8)).toBeLessThan(0.07);
    expect(Math.abs(swing(3, 1, Infinity, 1))).toBeLessThanOrEqual(0.05);
  });
  it("hangs lanterns beside the title and keeps the posts in the side margins, on narrow and wide pages", () => {
    for (const width of [320, 360, 375, 430, 448]) {
      const l = layout(width, { top: 330, height: width - 32 });
      for (const lantern of l.lanterns) {
        expect(Math.abs(lantern.x) + lantern.width / 2).toBeLessThanOrEqual(width / 2);
        expect(Math.abs(lantern.x) - lantern.width / 2).toBeGreaterThanOrEqual(Math.min(TITLE_HALF, width / 2 - 36) - 0.5);
      }
      expect(width / 2 - l.postX).toBeLessThan(16);
      expect(l.postBottom).toBeGreaterThan(l.centreY + l.boardHalf);
    }
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
  });
});
