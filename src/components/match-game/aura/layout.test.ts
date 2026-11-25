import { describe, expect, it } from "vitest";
import { MIN_FRAME_MS, MOTES, PAD_Y, rings } from "./layout";

describe("matching game backdrop", () => {
  it("keeps every ring inside the layer on phones and wide screens", () => {
    for (const [width, height] of [[320, 520], [375, 606], [504, 560]]) {
      for (const ring of rings(width, height)) {
        expect(ring.rx + ring.tube).toBeLessThanOrEqual(width / 2);
        expect(ring.ry + ring.tube).toBeLessThanOrEqual(height / 2);
        // the top and bottom of each ring show beyond the board
        expect(ring.ry).toBeGreaterThan(height / 2 - PAD_Y);
      }
    }
  });
  it("stays soft and light on the device", () => {
    for (const ring of rings(375, 606)) expect(ring.base).toBeLessThanOrEqual(0.25);
    expect(rings(375, 606)).toHaveLength(3);
    expect(MOTES).toBeLessThanOrEqual(80);
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
    expect(rings(0, 0).every((r) => r.rx >= 1 && r.ry >= 1)).toBe(true);
  });
});
