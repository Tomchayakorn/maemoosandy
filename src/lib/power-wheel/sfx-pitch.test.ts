import { describe, expect, it } from "vitest";
import { pitchFor } from "./sfx-pitch";

describe("pitchFor", () => {
  it("starts at 1 and rises a quarter of an octave by level 12", () => {
    expect(pitchFor(0)).toBe(1);
    expect(pitchFor(12)).toBeCloseTo(Math.pow(2, 0.25), 10);
    expect(pitchFor(12)).toBeLessThan(1.2); // about 3 semitones: gentle
  });
  it("rises with every level", () => {
    for (let k = 1; k <= 12; k++) expect(pitchFor(k)).toBeGreaterThan(pitchFor(k - 1));
  });
  it("clamps and survives bad input", () => {
    expect(pitchFor(-3)).toBe(1);
    expect(pitchFor(99)).toBe(pitchFor(12));
    expect(pitchFor(Number.NaN)).toBe(1);
  });
});
