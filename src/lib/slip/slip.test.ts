import { describe, expect, it } from "vitest";
import { checkSlip, normalizeName, receiverAccountMatches, receiverNameMatches } from "./checks";
import type { SlipData } from "./types";
import { bonusCoins, findPackage, PACKAGES } from "../packages";

const NOW = new Date("2026-11-18T10:00:00+07:00");

const slip = (over: Partial<SlipData> = {}): SlipData => ({
  provider: "test",
  transRef: "REF123",
  amount: 99,
  paidAt: "2026-11-18T09:55:00+07:00",
  receiverName: "นาง แซนดี้ ณ",
  receiverAccount: "xxx-x-x3109-x",
  receiverMatched: null,
  providerRef: null,
  ...over,
});

const opts = (over: Partial<Parameters<typeof checkSlip>[1]> = {}) => ({
  expectedAmount: 99,
  receiver: { name: "นางแซนดี้ ณ มัณตรา", account: "123-4-53109-0" },
  now: NOW,
  maxAgeHours: 24,
  ...over,
});

describe("packages", () => {
  it("match the brief", () => {
    expect(PACKAGES.map((p) => [p.id, p.priceThb, p.coins])).toEqual([
      ["pkg_50", 50, 50],
      ["pkg_99", 99, 100],
      ["pkg_199", 199, 210],
      ["pkg_299", 299, 330],
      ["pkg_499", 499, 540],
      ["pkg_999", 999, 1050],
    ]);
    expect(bonusCoins(findPackage("pkg_299")!)).toBe(31);
    expect(bonusCoins(findPackage("pkg_499")!)).toBe(41);
    expect(bonusCoins(findPackage("pkg_999")!)).toBe(51);
    expect(findPackage("pkg_1000")).toBeUndefined();
  });

  it("have the agreed names and badges for the big packages", () => {
    expect(findPackage("pkg_499")).toMatchObject({ name: "แพ็กเกจเจ้าสัวสายมู", badge: "โบนัสจุกๆ" });
    expect(findPackage("pkg_999")).toMatchObject({ name: "แพ็กเกจมหาเศรษฐี ณ มัณตรา", badge: "VIP คุ้มที่สุด" });
  });

  it("are sane: unique ids, ascending prices, never fewer coins than baht paid", () => {
    expect(new Set(PACKAGES.map((p) => p.id)).size).toBe(PACKAGES.length);
    const prices = PACKAGES.map((p) => p.priceThb);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    for (const p of PACKAGES) {
      expect(p.coins).toBeGreaterThanOrEqual(p.priceThb);
      expect(p.id).toBe(`pkg_${p.priceThb}`);
    }
  });
});

describe("receiver matching", () => {
  it("normalises names", () => {
    expect(normalizeName("นาง แซนดี้ ณ.")).toBe("แซนดี้ณ");
    expect(normalizeName("MS. Sandy N")).toBe("sandyn");
  });

  it("accepts shortened slip names", () => {
    expect(receiverNameMatches("นาง แซนดี้ ณ", "นางแซนดี้ ณ มัณตรา")).toBe(true);
    expect(receiverNameMatches("แซนดี้ ณ", "แซนดี้ ณ มัณตรา")).toBe(true);
    expect(receiverNameMatches("SANDY N", "Sandy Namantra")).toBe(true);
    expect(receiverNameMatches("แซนดี้", "แซนดี้ ณ มัณตรา")).toBe(true);
  });

  it("rejects other people", () => {
    expect(receiverNameMatches("สมชาย ใ", "แซนดี้ ณ มัณตรา")).toBe(false);
    expect(receiverNameMatches("แซนดี้ ก", "แซนดี้ ณ มัณตรา")).toBe(false);
  });

  it("matches masked account and phone numbers", () => {
    expect(receiverAccountMatches("xxx-x-x3109-x", "123-4-53109-0")).toBe(true);
    expect(receiverAccountMatches("xxx-x-x3110-x", "123-4-53109-0")).toBe(false);
    expect(receiverAccountMatches("086xxx0000", "0861230000")).toBe(true);
    expect(receiverAccountMatches("xxx-xxx-0000", "0861230000")).toBe(true);
    expect(receiverAccountMatches("xxx-xxx-9999", "0861230000")).toBe(false);
    expect(receiverAccountMatches("xxxxxxx", "0861230000")).toBe(false);
  });
});

describe("checkSlip", () => {
  it("accepts a correct, recent payment to us", () => {
    expect(checkSlip(slip(), opts())).toEqual({ ok: true });
  });

  it("accepts exactly the 499 and 999 packages and nothing else", () => {
    const at = (amount: number, expected: number) => checkSlip(slip({ amount }), opts({ expectedAmount: expected }));
    expect(at(499, 499)).toEqual({ ok: true });
    expect(at(999, 999)).toEqual({ ok: true });
    // paying the smaller package's price for the bigger one (the classic cheat) is rejected
    expect(at(499, 999)).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
    expect(at(299, 499)).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
    expect(at(999, 499)).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
    expect(at(998.99, 999)).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
  });

  it("rejects the wrong amount (to the satang)", () => {
    expect(checkSlip(slip({ amount: 98.99 }), opts())).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
    expect(checkSlip(slip({ amount: 199 }), opts())).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
  });

  it("rejects payments to someone else", () => {
    expect(checkSlip(slip({ receiverName: "สมชาย ใ" }), opts())).toMatchObject({ ok: false, code: "RECEIVER_MISMATCH" });
    expect(checkSlip(slip({ receiverAccount: "xxx-x-x9999-x" }), opts())).toMatchObject({ ok: false, code: "RECEIVER_MISMATCH" });
    expect(checkSlip(slip({ receiverMatched: false }), opts())).toMatchObject({ ok: false, code: "RECEIVER_MISMATCH" });
  });

  it("trusts a provider-confirmed receiver", () => {
    expect(checkSlip(slip({ receiverMatched: true, receiverName: null, receiverAccount: null }), opts())).toEqual({ ok: true });
  });

  it("refuses to accept slips when no receiver is configured", () => {
    expect(checkSlip(slip(), opts({ receiver: { name: null, account: null } }))).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
  });

  it("rejects slips without receiver details to compare", () => {
    expect(checkSlip(slip({ receiverName: null, receiverAccount: null }), opts())).toMatchObject({ ok: false, code: "RECEIVER_MISMATCH" });
  });

  it("rejects old and future-dated slips", () => {
    expect(checkSlip(slip({ paidAt: "2026-11-16T09:00:00+07:00" }), opts())).toMatchObject({ ok: false, code: "TOO_OLD" });
    expect(checkSlip(slip({ paidAt: "2026-11-18T12:00:00+07:00" }), opts())).toMatchObject({ ok: false, code: "NOT_A_SLIP" });
  });
});
