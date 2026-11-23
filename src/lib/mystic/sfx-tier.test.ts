import { describe, expect, it } from "vitest";
import { rewardTier } from "./sfx-tier";

describe("rewardTier", () => {
  it("small for a modest multiplier", () => {
    expect(rewardTier(10, 10, null)).toBe("small");
    expect(rewardTier(19, 10, null)).toBe("small");
  });
  it("good from x2", () => {
    expect(rewardTier(20, 10, null)).toBe("good");
    expect(rewardTier(99, 10, null)).toBe("good");
  });
  it("big from x10 or 1,000 coins", () => {
    expect(rewardTier(100, 10, null)).toBe("big");
    expect(rewardTier(1000, 100, null)).toBe("big");
  });
  it("jackpot-grade whenever the round paid out by itself", () => {
    expect(rewardTier(5000, 100, "cap")).toBe("jackpot");
    expect(rewardTier(115, 100, "all_open")).toBe("jackpot");
  });
  it("never throws on a zero bet", () => {
    expect(rewardTier(0, 0, null)).toBe("small");
  });
});
