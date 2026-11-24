import { describe, expect, it } from "vitest";
import { formatCountdown, msUntilReset } from "./countdown";

describe("msUntilReset", () => {
  it("counts to the next Bangkok midnight (17:00 UTC)", () => {
    expect(msUntilReset(new Date("2026-11-25T16:00:00Z"))).toBe(3_600_000); // 23:00 in Bangkok
    expect(msUntilReset(new Date("2026-11-25T10:00:00Z"))).toBe(7 * 3_600_000); // 17:00 in Bangkok
  });
  it("one second before and exactly at midnight", () => {
    expect(msUntilReset(new Date("2026-11-25T16:59:59Z"))).toBe(1000);
    expect(msUntilReset(new Date("2026-11-25T17:00:00Z"))).toBe(24 * 3_600_000); // a new day has just started
  });
});

describe("formatCountdown", () => {
  it("formats HH:MM:SS and rounds partial seconds up", () => {
    expect(formatCountdown(3_661_000)).toBe("01:01:01");
    expect(formatCountdown(59_001)).toBe("00:01:00");
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
});
