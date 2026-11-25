import { describe, expect, it } from "vitest";
import { cardSoundTier } from "./sfx-tier";

describe("lucky card sound tier", () => {
  it("separates no-coin messages, ordinary bonuses and the big prizes", () => {
    expect(cardSoundTier({ kind: "message", messageId: "x" })).toBe("soft");
    for (const coins of [15, 40, 100]) expect(cardSoundTier({ kind: "bonus", coins })).toBe("coins");
    expect(cardSoundTier({ kind: "bonus", coins: 300 })).toBe("good");
    expect(cardSoundTier({ kind: "bonus", coins: 500 })).toBe("big");
    expect(cardSoundTier({ kind: "secret", prizeId: "p", amountThb: 1000 })).toBe("secret");
  });
});
