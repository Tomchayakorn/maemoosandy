import { describe, expect, it } from "vitest";
import { cameraDistance, lookAtHeight, orbitPose, pixelRatioFor, tallness, TARGET_HEIGHT } from "./camera";

describe("home 3D backdrop camera", () => {
  it("frames tall screens from further away and looks higher, so the shrine sits lower", () => {
    expect(tallness(0.46)).toBe(1);
    expect(tallness(1.78)).toBe(0);
    expect(cameraDistance(0.46)).toBeGreaterThan(cameraDistance(1.78));
    expect(lookAtHeight(0.46)).toBeGreaterThan(lookAtHeight(1.78));
  });
  it("stays above the floor, in front of the shrine, and moves gently", () => {
    for (const aspect of [0.46, 1, 1.78]) {
      let prev = orbitPose(0, aspect);
      for (let t = 1 / 30; t < 120; t += 1 / 30) {
        const p = orbitPose(t, aspect);
        expect(p.y).toBeGreaterThan(TARGET_HEIGHT);
        expect(p.z).toBeGreaterThan(0);
        expect(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z)).toBeLessThan(0.05);
        prev = p;
      }
    }
  });
  it("keeps the render resolution low", () => {
    expect(pixelRatioFor(3, 375)).toBe(1.25);
    expect(pixelRatioFor(3, 1200)).toBe(1.5);
    expect(pixelRatioFor(1, 375)).toBe(1);
    expect(pixelRatioFor(3, 375, true)).toBe(1);
  });
});
