import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/respond", () => ({
  apiError: (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ error: { code, message } }), { status }),
}));

import { _resetRateLimits, checkRateLimit, rateLimitResponse } from "./rate-limit";

const cfg = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimits());

  it("allows up to the limit then blocks", () => {
    for (let i = 0; i < 3; i++) expect(checkRateLimit("u1", "x", cfg, 1000 + i).ok).toBe(true);
    const r = checkRateLimit("u1", "x", cfg, 1010);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("slides the window", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("u1", "x", cfg, 0);
    expect(checkRateLimit("u1", "x", cfg, 59_999).ok).toBe(false);
    expect(checkRateLimit("u1", "x", cfg, 60_001).ok).toBe(true);
  });

  it("isolates users and routes", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("u1", "x", cfg, 0);
    expect(checkRateLimit("u2", "x", cfg, 1).ok).toBe(true);
    expect(checkRateLimit("u1", "y", cfg, 1).ok).toBe(true);
  });

  it("does not count blocked attempts against the window", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("u1", "x", cfg, 0);
    for (let i = 0; i < 10; i++) checkRateLimit("u1", "x", cfg, 30_000);
    expect(checkRateLimit("u1", "x", cfg, 60_001).ok).toBe(true);
  });
});

describe("rateLimitResponse", () => {
  beforeEach(() => _resetRateLimits());

  it("returns null under the limit and a 429 with Retry-After over it", () => {
    for (let i = 0; i < 5; i++) expect(rateLimitResponse("u1", "tarot")).toBeNull();
    const res = rateLimitResponse("u1", "tarot");
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
