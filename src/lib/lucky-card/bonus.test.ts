import { describe, expect, it } from "vitest";
import { BONUS_TARGET, bonusProgress, bonusWithdrawState } from "./bonus";

describe("bonus progress", () => {
  it("caps at 100% and ignores bad numbers", () => {
    expect(bonusProgress(0)).toBe(0);
    expect(bonusProgress(250)).toBe(0.25);
    expect(bonusProgress(BONUS_TARGET)).toBe(1);
    expect(bonusProgress(2300)).toBe(1);
    expect(bonusProgress(-5)).toBe(0);
    expect(bonusProgress(Number.NaN)).toBe(0);
  });
  it("withdraw state: locked → ready → pending", () => {
    expect(bonusWithdrawState(999, false)).toEqual({ kind: "locked", remaining: 1 });
    expect(bonusWithdrawState(1000, false)).toEqual({ kind: "ready" });
    expect(bonusWithdrawState(1400, false)).toEqual({ kind: "ready" });
    expect(bonusWithdrawState(1400, true)).toEqual({ kind: "pending" }); // never a second request while one is waiting
  });
});
