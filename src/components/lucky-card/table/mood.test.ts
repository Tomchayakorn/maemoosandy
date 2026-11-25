import { describe, expect, it } from "vitest";
import { MIN_FRAME_MS, MOOD_LOOK, moodOf, stepLook } from "./mood";

describe("lucky card table moods", () => {
  it("follows the screen: picking, opening, then special only for a bonus or the secret prize", () => {
    expect(moodOf("pick")).toBe("idle");
    expect(moodOf("loading")).toBe("opening");
    expect(moodOf("result", "bonus")).toBe("special");
    expect(moodOf("result", "secret")).toBe("special");
    expect(moodOf("result", "message")).toBe("calm");
  });
  it("brightens while opening and sparkles only for a special prize", () => {
    expect(MOOD_LOOK.opening.glow).toBeGreaterThan(MOOD_LOOK.idle.glow);
    expect(Object.entries(MOOD_LOOK).filter(([, l]) => l.burst > 0).map(([m]) => m)).toEqual(["special"]);
  });
  it("eases softly and stays at 30 fps or less", () => {
    let look = MOOD_LOOK.idle;
    expect(stepLook(look, MOOD_LOOK.opening, 1 / 30).glow - look.glow).toBeLessThan(0.1);
    for (let i = 0; i < 150; i++) look = stepLook(look, MOOD_LOOK.opening, 1 / 30);
    expect(look.glow).toBeCloseTo(MOOD_LOOK.opening.glow, 2);
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
  });
});
