import { describe, expect, it } from "vitest";
import { MIN_FRAME_MS, MOOD_LOOK, moodOf, stepLook } from "./mood";

describe("lucky wheel altar moods", () => {
  it("follows the page: spinning wins over everything, the open result rests, then it celebrates", () => {
    expect(moodOf({ spinning: true, resultOpen: true, celebrating: true })).toBe("spinning");
    expect(moodOf({ spinning: false, resultOpen: true, celebrating: true })).toBe("covered");
    expect(moodOf({ spinning: false, resultOpen: false, celebrating: true })).toBe("win");
    expect(moodOf({ spinning: false, resultOpen: false, celebrating: false })).toBe("idle");
  });
  it("is brighter and quicker while spinning and sparkles only after a win", () => {
    expect(MOOD_LOOK.spinning.speed).toBeGreaterThan(MOOD_LOOK.idle.speed * 3);
    expect(MOOD_LOOK.win.glow).toBeGreaterThan(MOOD_LOOK.idle.glow);
    expect(Object.entries(MOOD_LOOK).filter(([, l]) => l.burst > 0).map(([m]) => m)).toEqual(["win"]);
  });
  it("eases between looks and stays at 30 fps or less", () => {
    let look = MOOD_LOOK.idle;
    expect(stepLook(look, MOOD_LOOK.spinning, 1 / 30).speed - look.speed).toBeLessThan(0.25);
    for (let i = 0; i < 150; i++) look = stepLook(look, MOOD_LOOK.spinning, 1 / 30);
    expect(look.speed).toBeCloseTo(MOOD_LOOK.spinning.speed, 1);
    expect(MIN_FRAME_MS).toBeGreaterThanOrEqual(30);
  });
});
