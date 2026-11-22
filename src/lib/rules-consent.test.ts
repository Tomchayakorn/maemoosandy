import { beforeEach, describe, expect, it } from "vitest";
import { _resetRulesConsentMemory, hasConfirmedRules, rulesConsentKey, saveRulesConfirmed } from "./rules-consent";

function fakeStore(): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

beforeEach(() => _resetRulesConsentMemory());

describe("rules consent", () => {
  it("keys are separate per game and per user", () => {
    expect(rulesConsentKey("wheel", "u1")).not.toBe(rulesConsentKey("lucky-card", "u1"));
    expect(rulesConsentKey("wheel", "u1")).not.toBe(rulesConsentKey("wheel", "u2"));
  });
  it("is not confirmed until saved, and only for that game/user", () => {
    const s = fakeStore();
    const k = rulesConsentKey("wheel", "u1");
    expect(hasConfirmedRules(k, s)).toBe(false);
    saveRulesConfirmed(k, s);
    expect(hasConfirmedRules(k, s)).toBe(true);
    _resetRulesConsentMemory(); // a fresh page load reads from storage
    expect(hasConfirmedRules(k, s)).toBe(true);
    expect(hasConfirmedRules(rulesConsentKey("lucky-card", "u1"), s)).toBe(false);
    expect(hasConfirmedRules(rulesConsentKey("wheel", "u2"), s)).toBe(false);
  });
  it("cleared browser data asks again", () => {
    const s = fakeStore();
    const k = rulesConsentKey("lucky-card", "u1");
    saveRulesConfirmed(k, s);
    _resetRulesConsentMemory();
    s.data.clear();
    expect(hasConfirmedRules(k, s)).toBe(false);
  });
  it("survives a storage that throws (kept in memory for the tab)", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const k = rulesConsentKey("wheel", "u1");
    expect(hasConfirmedRules(k, broken)).toBe(false);
    expect(() => saveRulesConfirmed(k, broken)).not.toThrow();
    expect(hasConfirmedRules(k, broken)).toBe(true);
  });
});
