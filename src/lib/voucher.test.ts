import { describe, expect, it } from "vitest";
import {
  bangkokLocalToIso, generateVoucherCode, isValidVoucherCode, normalizeVoucherCode, redeemModel, voucherStatus,
  type VoucherModelState,
} from "./voucher";

describe("normalizeVoucherCode", () => {
  it("trims, removes all spaces, upper-cases", () => {
    expect(normalizeVoucherCode("  mae mu-2026 \n")).toBe("MAEMU-2026");
    expect(normalizeVoucherCode("ab cd\tef")).toBe("ABCDEF");
  });
  it("folds full-width letters/digits and unicode dashes, drops invisible characters", () => {
    expect(normalizeVoucherCode("ＭＡＥ１２３")).toBe("MAE123");
    expect(normalizeVoucherCode("MAE–123")).toBe("MAE-123");
    expect(normalizeVoucherCode("MA​E123")).toBe("MAE123");
  });
  it("validity: 4..24 of A-Z 0-9 and -", () => {
    expect(isValidVoucherCode("ABCD")).toBe(true);
    expect(isValidVoucherCode("MAE-2026")).toBe(true);
    expect(isValidVoucherCode("ABC")).toBe(false);
    expect(isValidVoucherCode("A".repeat(25))).toBe(false);
    expect(isValidVoucherCode("ABC_D")).toBe(false);
    expect(isValidVoucherCode("abcd")).toBe(false);
  });
  it("generated codes are valid and avoid look-alike characters", () => {
    let i = 0;
    const code = generateVoucherCode(() => (i += 7) % 31);
    expect(isValidVoucherCode(code)).toBe(true);
    expect(code).toHaveLength(8);
    for (let k = 0; k < 200; k++) expect(generateVoucherCode((n) => Math.floor(Math.random() * n))).not.toMatch(/[01OIL]/);
  });
});

describe("voucherStatus / expiry in Bangkok time", () => {
  const base = { is_active: true, expires_at: "2026-11-23T13:00:00Z", max_redemptions: 5, redeemed_count: 2 };
  const now = new Date("2026-11-23T10:00:00Z");
  it("active, disabled, expired, full", () => {
    expect(voucherStatus(base, now)).toBe("active");
    expect(voucherStatus({ ...base, is_active: false }, now)).toBe("disabled");
    expect(voucherStatus({ ...base, expires_at: "2026-11-23T10:00:00Z" }, now)).toBe("expired"); // expires AT the instant
    expect(voucherStatus({ ...base, redeemed_count: 5 }, now)).toBe("full");
  });
  it("datetime-local (Bangkok) → UTC", () => {
    expect(bangkokLocalToIso("2026-11-23T20:00")).toBe("2026-11-23T13:00:00.000Z");
    expect(bangkokLocalToIso("2026-11-23T00:30")).toBe("2026-11-22T17:30:00.000Z");
    expect(bangkokLocalToIso("nonsense")).toBeNull();
  });
});

describe("redeemModel (what redeem_voucher guarantees)", () => {
  const fresh = (over: Partial<NonNullable<VoucherModelState["voucher"]>> = {}): VoucherModelState => ({
    voucher: { code: "MAEMU", coins: 100, is_active: true, expires_at: "2026-11-24T00:00:00Z", max_redemptions: 2, redeemed_count: 0, ...over },
    redeemedBy: [], balances: { a: 10 }, ledger: [],
  });
  const now = new Date("2026-11-23T10:00:00Z");

  it("success credits the wallet, counts the use and writes a 'voucher' ledger row (never a top-up)", () => {
    const r = redeemModel(fresh(), "a", " maemu ", now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.coins).toBe(100);
    expect(r.balance).toBe(110);
    expect(r.state.voucher?.redeemed_count).toBe(1);
    expect(r.state.ledger).toEqual([{ user: "a", reason: "voucher", coins: 100 }]);
  });
  it("one use per account: a second tap / second device is refused and credits nothing", () => {
    const first = redeemModel(fresh(), "a", "MAEMU", now);
    if (!first.ok) throw new Error("setup");
    const again = redeemModel(first.state, "a", "MAEMU", now);
    expect(again).toEqual({ ok: false, error: "VOUCHER_ALREADY_USED" });
    expect(first.state.balances.a).toBe(110);
    expect(first.state.voucher?.redeemed_count).toBe(1);
  });
  it("total uses are capped: the last slot goes to one person only", () => {
    let st = fresh({ max_redemptions: 2 });
    for (const u of ["a", "b"]) {
      const r = redeemModel(st, u, "MAEMU", now);
      if (!r.ok) throw new Error("setup");
      st = r.state;
    }
    expect(redeemModel(st, "c", "MAEMU", now)).toEqual({ ok: false, error: "VOUCHER_FULL" });
    expect(st.voucher?.redeemed_count).toBe(2);
    // a player who already used it hears "already used", not "full"
    expect(redeemModel(st, "a", "MAEMU", now)).toEqual({ ok: false, error: "VOUCHER_ALREADY_USED" });
  });
  it("unknown, disabled and expired codes", () => {
    expect(redeemModel(fresh(), "a", "WRONG", now)).toEqual({ ok: false, error: "VOUCHER_NOT_FOUND" });
    expect(redeemModel(fresh({ is_active: false }), "a", "MAEMU", now)).toEqual({ ok: false, error: "VOUCHER_DISABLED" });
    expect(redeemModel(fresh({ expires_at: "2026-11-23T09:59:59Z" }), "a", "MAEMU", now)).toEqual({ ok: false, error: "VOUCHER_EXPIRED" });
  });
  it("coins never change on any failure", () => {
    const st = fresh({ is_active: false });
    redeemModel(st, "a", "MAEMU", now);
    expect(st.balances.a).toBe(10);
    expect(st.ledger).toEqual([]);
  });
});
