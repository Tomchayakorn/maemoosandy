import { describe, expect, it } from "vitest";
import { MAX_SPOKEN_CHARS, normalizeForSpeech, toSpeechPhrases } from "./thai-text";

describe("speech text", () => {
  it("drops emoji and symbols the voice cannot say, keeps Thai and digits", () => {
    const t = normalizeForSpeech("✨ วันนี้ 28 พ.ย. ★ โชคดีนะคะ 🙏 → ต่อไป");
    expect(t).not.toMatch(/[✨★🙏→]/);
    expect(t).toContain("28");
    expect(t).toContain("โชคดี");
  });
  it("keeps phrases short and caps the total spoken length", () => {
    const long = Array.from({ length: 400 }, (_, i) => `ประโยคที่ ${i} บอกว่าวันนี้ดวงดีมากเลย`).join(" ");
    const phrases = toSpeechPhrases(`## หัวข้อ\n${long}`);
    expect(phrases.every((p) => p.text.length <= 140)).toBe(true);
    expect(phrases.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(MAX_SPOKEN_CHARS + 140);
    expect(phrases[0].kind).toBe("heading");
  });
});
