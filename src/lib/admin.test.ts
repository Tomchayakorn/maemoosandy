import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { isAdminUser } from "./admin";

describe("isAdminUser", () => {
  afterEach(() => vi.unstubAllEnvs());
  const u = (email: string | null, confirmed = "2026-01-01") => ({ email: email ?? undefined, email_confirmed_at: confirmed });

  it("matches listed, confirmed emails case-insensitively", () => {
    vi.stubEnv("ADMIN_EMAILS", "Boss@Example.com, other@x.com");
    expect(isAdminUser(u("boss@example.com"))).toBe(true);
    expect(isAdminUser(u("nobody@example.com"))).toBe(false);
  });
  it("nobody is admin when unset, unconfirmed or signed out", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminUser(u("boss@example.com"))).toBe(false);
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
    expect(isAdminUser({ email: "boss@example.com", email_confirmed_at: undefined })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
});
