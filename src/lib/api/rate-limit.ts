import "server-only";

import { apiError } from "@/lib/api/respond";

type Limit = { limit: number; windowMs: number };

/** Per-user request budgets (per minute). Best-effort: state is per server instance. */
export const RATE_LIMITS = {
  tarot: { limit: 5, windowMs: 60_000 },
  birthdate: { limit: 5, windowMs: 60_000 },
  topupVerify: { limit: 6, windowMs: 60_000 },
  wheelSpin: { limit: 20, windowMs: 60_000 },
  wheelCheckin: { limit: 10, windowMs: 60_000 },
  wheelUseCard: { limit: 10, windowMs: 60_000 },
  wheelCashWithdraw: { limit: 5, windowMs: 60_000 },
  mysticStart: { limit: 30, windowMs: 60_000 },
  mysticOpen: { limit: 120, windowMs: 60_000 },
  mysticCashout: { limit: 30, windowMs: 60_000 },
  powerStart: { limit: 30, windowMs: 60_000 },
  powerSpin: { limit: 60, windowMs: 60_000 },
  powerStop: { limit: 30, windowMs: 60_000 },
  matchStart: { limit: 20, windowMs: 60_000 },
  matchFlip: { limit: 90, windowMs: 60_000 },
  matchState: { limit: 60, windowMs: 60_000 },
  voucherRedeem: { limit: 8, windowMs: 60_000 },
  catGamePlay: { limit: 10, windowMs: 60_000 },
  luckyCardPlay: { limit: 30, windowMs: 60_000 },
  luckyCardWithdraw: { limit: 5, windowMs: 60_000 },
  withdrawRequest: { limit: 5, windowMs: 60_000 },
  adminReview: { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

const hits = new Map<string, number[]>();
let lastSweep = 0;

/**
 * Sliding-window check. Returns `{ ok: true }`, or `{ ok: false, retryAfterSec }`.
 * `userId` must be the verified user id — never a value from the request.
 */
export function checkRateLimit(userId: string, name: string, { limit, windowMs }: Limit, now = Date.now()) {
  const key = `${name}:${userId}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) } as const;
  }
  recent.push(now);
  hits.set(key, recent);

  // Occasionally drop idle keys so the map cannot grow without bound.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of hits) if (v.length === 0 || now - v[v.length - 1] > 10 * 60_000) hits.delete(k);
  }
  return { ok: true } as const;
}

/** 429 response to return as-is when over the limit, else null. */
export function rateLimitResponse(userId: string, name: keyof typeof RATE_LIMITS) {
  const result = checkRateLimit(userId, name, RATE_LIMITS[name]);
  if (result.ok) return null;
  const res = apiError(429, "RATE_LIMITED", "ใช้งานถี่เกินไปค่ะ กรุณารอสักครู่แล้วลองใหม่นะคะ");
  res.headers.set("Retry-After", String(result.retryAfterSec));
  return res;
}

/** Test helper. */
export function _resetRateLimits() {
  hits.clear();
  lastSweep = 0;
}
