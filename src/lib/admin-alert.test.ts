import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notify = vi.fn<(text: string) => Promise<boolean>>();
vi.mock("@/lib/line-notify", () => ({ notifyAdminLine: (t: string) => notify(t) }));

import {
  _resetAdminAlertDedupe, alertAdminError, bangkokTimestamp, describeError, formatAdminAlert, shouldAlertRpcError,
} from "./admin-alert";

beforeEach(() => {
  notify.mockReset();
  notify.mockResolvedValue(true);
  _resetAdminAlertDedupe();
});

describe("shouldAlertRpcError", () => {
  it("ignores expected user-level outcomes", () => {
    for (const m of ["INSUFFICIENT_COINS", "ALREADY_PLAYED_TODAY", "NOTHING_TO_RESET", "ROUND_NOT_ACTIVE", "ROUND_NOT_FOUND", "TILE_ALREADY_OPENED", "ACTIVE_ROUND_EXISTS", "NO_SAFE_TILE"]) expect(shouldAlertRpcError({ message: m })).toBe(false);
    expect(shouldAlertRpcError(null)).toBe(false);
  });
  it("alerts on real server failures", () => {
    expect(shouldAlertRpcError({ message: "permission denied for table wallets" })).toBe(true);
    expect(shouldAlertRpcError({ code: "PGRST202", message: "Could not find the function public.play_cat_game" })).toBe(true);
    expect(shouldAlertRpcError({ message: "WALLET_NOT_FOUND" })).toBe(true);
    expect(shouldAlertRpcError(new Error("boom"))).toBe(true);
  });
});

describe("message format", () => {
  it("Thai time (UTC+7), place, user id and error", () => {
    expect(bangkokTimestamp(new Date("2026-11-22T07:03:11Z"))).toBe("22/11/2026 14:03:11");
    const text = formatAdminAlert({ where: "play_cat_game", userId: "u-1", error: { code: "42501", message: "permission denied" }, now: new Date("2026-11-22T07:03:11Z") });
    expect(text).toContain("เวลา: 22/11/2026 14:03:11 (เวลาไทย)");
    expect(text).toContain("จุดที่พัง: play_cat_game");
    expect(text).toContain("User ID: u-1");
    expect(text).toContain("Error: [42501] permission denied");
    expect(formatAdminAlert({ where: "x", error: "e" })).toContain("User ID: -");
  });
  it("describeError is one short line without stack", () => {
    expect(describeError(new Error("a\n  b")).includes("\n")).toBe(false);
    expect(describeError("x".repeat(1000)).length).toBe(300);
  });
});

describe("alertAdminError", () => {
  it("sends one LINE message", async () => {
    await alertAdminError({ where: "play_cat_game", userId: "u", error: "boom" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("boom");
  });
  it("never throws even if LINE sending throws", async () => {
    notify.mockRejectedValue(new Error("LINE down"));
    await expect(alertAdminError({ where: "w", error: "e" })).resolves.toBeUndefined();
  });
  it("does not repeat the same alert within the window but sends a different one", async () => {
    await alertAdminError({ where: "w", error: "same" });
    await alertAdminError({ where: "w", error: "same" });
    await alertAdminError({ where: "w", error: "other" });
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
