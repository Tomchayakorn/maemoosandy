import { describe, expect, it } from "vitest";
import { findPackage } from "./packages";
import {
  bangkokDateOf, bangkokDayRange, formatSummaryMessage, matchExcludedUsers, parseExcludeList, previousBangkokDate, summarizeDay, thaiDateLabel,
  type ExpenseRow, type IncomeRow,
} from "./daily-summary";

describe("Bangkok day window", () => {
  it("a Bangkok day is [00:00, 24:00) Bangkok = 17:00Z the day before .. 17:00Z", () => {
    const { start, end } = bangkokDayRange("2026-11-22");
    expect(start.toISOString()).toBe("2026-11-21T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-22T17:00:00.000Z");
  });
  it("the 00:05 Bangkok run (17:05 UTC) summarises the day that just ended", () => {
    expect(bangkokDateOf(new Date("2026-11-21T17:05:00Z"))).toBe("2026-11-22"); // it is already the 22nd in Bangkok
    expect(previousBangkokDate(new Date("2026-11-21T17:05:00Z"))).toBe("2026-11-21");
    // a Vercel cron can fire anywhere in the hour; still the same day
    expect(previousBangkokDate(new Date("2026-11-21T17:59:59Z"))).toBe("2026-11-21");
    expect(previousBangkokDate(new Date("2026-11-22T16:59:59Z"))).toBe("2026-11-21"); // 23:59 Bangkok on the 22nd → day before
  });
  it("month and year boundaries", () => {
    expect(previousBangkokDate(new Date("2026-12-31T17:05:00Z"))).toBe("2026-12-31");
    expect(previousBangkokDate(new Date("2027-01-01T17:05:00Z"))).toBe("2027-01-01");
  });
});

// a normal slip top-up: package and coins are derived from the amount (override fields to make it abnormal)
const PKG_BY_PRICE: Record<number, string> = { 50: "pkg_50", 99: "pkg_99", 199: "pkg_199", 299: "pkg_299", 499: "pkg_499", 999: "pkg_999" };
let slipCounter = 0;
const inc = (over: Partial<IncomeRow> = {}): IncomeRow => {
  const amount = Number(over.amount_thb ?? 99);
  const pkg = PKG_BY_PRICE[amount] ?? "pkg_99";
  return {
    user_id: "u1", amount_thb: 99, status: "success", provider: "thunder", created_at: "2026-11-22T03:00:00Z",
    package_id: pkg, coins_added: findPackage(pkg)?.coins ?? 100, slip_ref: `slip-${++slipCounter}`, ...over,
  };
};
const exp = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({ user_id: "u1", amount_thb: 1000, status: "approved", source: "lucky_card_bonus", reviewed_at: "2026-11-22T05:00:00Z", ...over });

describe("summarizeDay", () => {
  it("income = successful real slips of that Bangkok day; counts rows and distinct players", () => {
    const s = summarizeDay("2026-11-22", [inc(), inc({ amount_thb: "50.00", user_id: "u2" }), inc({ user_id: "u2", amount_thb: 299 })], []);
    expect(s.income).toEqual({ thb: 448, count: 3, users: 2 });
  });
  it("ignores failed / rejected / pending attempts, mock-provider test credits and other days", () => {
    const rows = [
      inc({ status: "rejected" }), inc({ status: "failed" }), inc({ status: "pending" }),
      inc({ provider: "mock", amount_thb: 999 }),
      inc({ created_at: "2026-11-21T16:59:59Z" }), // 23:59:59 Bangkok on the 21st
      inc({ created_at: "2026-11-22T17:00:00Z" }), // 00:00 Bangkok on the 23rd
    ];
    expect(summarizeDay("2026-11-22", rows, []).income).toEqual({ thb: 0, count: 0, users: 0 });
  });
  it("includes the first and last second of the day", () => {
    const s = summarizeDay("2026-11-22", [inc({ created_at: "2026-11-21T17:00:00Z" }), inc({ created_at: "2026-11-22T16:59:59Z" })], []);
    expect(s.income.count).toBe(2);
  });
  it("expense = approved withdrawals by reviewed_at (the admin's confirm click), all sources, with a breakdown", () => {
    const s = summarizeDay("2026-11-22", [], [
      exp(), exp({ user_id: "u2", source: "jackpot", amount_thb: 5000 }), exp({ source: "wheel_cash", amount_thb: 500 }),
      exp({ status: "pending", reviewed_at: null }), exp({ status: "rejected" }),
      exp({ reviewed_at: "2026-11-21T10:00:00Z" }), // approved on another day
    ]);
    expect(s.expense.thb).toBe(6500);
    expect(s.expense.count).toBe(3);
    expect(s.expense.users).toBe(2);
    expect(s.expense.bySource).toEqual([
      { source: "jackpot", thb: 5000, count: 1 },
      { source: "lucky_card_bonus", thb: 1000, count: 1 },
      { source: "wheel_cash", thb: 500, count: 1 },
    ]);
  });
  it("net = income − expense (can be negative) and rounds to 2 decimals", () => {
    expect(summarizeDay("2026-11-22", [inc({ amount_thb: 99 }), inc({ amount_thb: 50 })], [exp({ amount_thb: 1000 })]).net).toBe(-851);
    expect(summarizeDay("2026-11-22", [inc({ amount_thb: 999 }), inc({ amount_thb: 499 })], [exp()]).net).toBe(498);
  });
});

describe("LINE message", () => {
  it("shows the date, income, expense (with sources) and the net difference", () => {
    const s = summarizeDay("2026-11-22", [inc({ amount_thb: 299 })], [exp({ source: "jackpot", amount_thb: 5000 })]);
    const text = formatSummaryMessage(s);
    expect(text).toContain("สรุปรายรับ-รายจ่าย");
    expect(text).toContain(thaiDateLabel("2026-11-22"));
    expect(text).toContain("รายรับ (ยอดสลิปเติมที่ยืนยันแล้ว)");
    expect(text).toContain("฿299.00");
    expect(text).toContain("1 รายการ · 1 ผู้เล่น");
    expect(text).toContain("รายจ่าย (ยอดสลิปโอนกลับที่กดยืนยันแล้ว)");
    expect(text).toContain("฿5,000.00");
    expect(text).toContain("ผลต่างสุทธิ");
    expect(text).toContain("−฿4,701.00");
    expect(text).toContain("ถอนรางวัลแจ็กพอตกงล้อ");
  });
  it("an empty day still produces a clear message", () => {
    const text = formatSummaryMessage(summarizeDay("2026-11-22", [], []));
    expect(text).toContain("฿0.00");
    expect(text).toContain("0 รายการ");
    expect(text).toContain("+฿0.00");
  });
});

describe("the admin's own tests are never counted", () => {
  const ADMIN = "admin-1";
  const excluded = new Set([ADMIN, "tester-2"]);
  it("income and expense of admin / test accounts are dropped from every figure, and reported as excluded", () => {
    const s = summarizeDay(
      "2026-11-22",
      [inc({ user_id: ADMIN, amount_thb: 999 }), inc({ user_id: "tester-2", amount_thb: 50 }), inc({ user_id: "real-1", amount_thb: 299 })],
      [exp({ user_id: ADMIN, amount_thb: 5000, source: "jackpot" }), exp({ user_id: "real-1", amount_thb: 1000 })],
      excluded,
    );
    expect(s.income).toEqual({ thb: 299, count: 1, users: 1 });
    expect(s.expense.thb).toBe(1000);
    expect(s.expense.count).toBe(1);
    expect(s.expense.bySource).toEqual([{ source: "lucky_card_bonus", thb: 1000, count: 1 }]);
    expect(s.net).toBe(-701);
    expect(s.excluded).toEqual({ income: 2, expense: 1, abnormalIncome: 0 });
  });
  it("a day with only admin tests is an empty day (0 / 0), not a day with money", () => {
    const s = summarizeDay("2026-11-22", [inc({ user_id: ADMIN })], [exp({ user_id: ADMIN })], excluded);
    expect(s.income).toEqual({ thb: 0, count: 0, users: 0 });
    expect(s.expense.thb).toBe(0);
    expect(s.net).toBe(0);
  });
  it("only rows that would otherwise count are reported as excluded (a rejected admin row is not 'excluded')", () => {
    const s = summarizeDay("2026-11-22", [inc({ user_id: ADMIN, status: "rejected" })], [exp({ user_id: ADMIN, status: "rejected" })], excluded);
    expect(s.excluded).toEqual({ income: 0, expense: 0, abnormalIncome: 0 });
  });
  it("the LINE message says that admin / test rows are not included", () => {
    const s = summarizeDay("2026-11-22", [inc({ user_id: ADMIN })], [], excluded);
    const text = formatSummaryMessage(s);
    expect(text).toContain("ไม่รวมรายการทดสอบของแอดมิน");
    expect(text).toContain("ตัดออก 1 รายการ");
    expect(text).toContain("฿0.00");
  });
  it("resolves excluded users by email (case-insensitive) or id, and ignores unknown entries", () => {
    const users = [
      { id: "11111111-1111-1111-1111-111111111111", email: "Admin@X.com" },
      { id: "22222222-2222-2222-2222-222222222222", email: "tester@x.com" },
      { id: "33333333-3333-3333-3333-333333333333", email: "player@x.com" },
      { id: "44444444-4444-4444-4444-444444444444", email: null },
    ];
    const entries = parseExcludeList(" admin@x.com , ", "22222222-2222-2222-2222-222222222222,nobody@x.com");
    expect(entries).toEqual(["admin@x.com", "22222222-2222-2222-2222-222222222222", "nobody@x.com"]);
    expect([...matchExcludedUsers(users, entries)].sort()).toEqual(["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]);
    expect(matchExcludedUsers(users, []).size).toBe(0);
  });
});

describe("abnormal top-ups are never counted (test amounts, manual credits, mock)", () => {
  it("only normal slip top-ups with an exact package amount count", () => {
    const rows = [
      inc({ amount_thb: 299 }), // normal
      inc({ provider: "mock", amount_thb: 999 }), // dev-only fake provider
      inc({ provider: null }), // manual / admin credit (no provider)
      inc({ provider: "admin" }), // anything that is not a real slip provider
      inc({ slip_ref: null }), // no slip reference
      inc({ amount_thb: 1 }), // not a package price (test amount)
      inc({ amount_thb: 99, coins_added: 5000 }), // coins do not match the package
      inc({ package_id: "pkg_unknown" }), // unknown package
    ];
    const s = summarizeDay("2026-11-22", rows, []);
    expect(s.income).toEqual({ thb: 299, count: 1, users: 1 });
    expect(s.excluded.abnormalIncome).toBe(7);
    expect(s.excluded.income).toBe(7);
  });
  it("an admin's NORMAL-looking top-up is still dropped (admin-owned account)", () => {
    const s = summarizeDay("2026-11-22", [inc({ user_id: "admin-1", amount_thb: 50 }), inc({ user_id: "p", amount_thb: 50 })], [], new Set(["admin-1"]));
    expect(s.income).toEqual({ thb: 50, count: 1, users: 1 });
    expect(s.excluded).toEqual({ income: 1, expense: 0, abnormalIncome: 0 });
  });
  it("every real package passes the check", () => {
    for (const a of [50, 99, 199, 299, 499, 999]) expect(summarizeDay("2026-11-22", [inc({ amount_thb: a })], []).income.thb).toBe(a);
  });
});
