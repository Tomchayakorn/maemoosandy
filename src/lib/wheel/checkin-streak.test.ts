import { describe, expect, it } from "vitest";
import { checkinStreak, streakMessage } from "./checkin-streak";

describe("checkinStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(checkinStreak(["2026-11-25", "2026-11-24", "2026-11-23"], "2026-11-25")).toEqual({ streak: 3, checkedInToday: true });
  });
  it("is still alive when only today is missing (counts from yesterday)", () => {
    expect(checkinStreak(["2026-11-24", "2026-11-23"], "2026-11-25")).toEqual({ streak: 2, checkedInToday: false });
  });
  it("a gap of a full day breaks it", () => {
    expect(checkinStreak(["2026-11-25", "2026-11-23"], "2026-11-25")).toEqual({ streak: 1, checkedInToday: true });
    expect(checkinStreak(["2026-11-23", "2026-11-22"], "2026-11-25")).toEqual({ streak: 0, checkedInToday: false });
  });
  it("handles month and year boundaries and duplicates / unordered input", () => {
    expect(checkinStreak(["2026-01-01", "2025-12-31", "2025-12-30", "2025-12-30"], "2026-01-01").streak).toBe(3);
    expect(checkinStreak(["2026-03-01", "2026-02-28"], "2026-03-01").streak).toBe(2);
    expect(checkinStreak(["2026-11-23", "2026-11-25", "2026-11-24"], "2026-11-25").streak).toBe(3);
  });
  it("empty history", () => {
    expect(checkinStreak([], "2026-11-25")).toEqual({ streak: 0, checkedInToday: false });
  });
});

describe("streakMessage", () => {
  it("nudges the next day once checked in, today otherwise", () => {
    expect(streakMessage(3, true)).toContain("วันที่ 4");
    expect(streakMessage(3, false)).toContain("วันที่ 4");
    expect(streakMessage(0, false)).toContain("เริ่มเช็กอิน");
  });
});
