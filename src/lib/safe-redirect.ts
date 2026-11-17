/**
 * Only allow redirects to paths on this site (blocks open redirects such as
 * "//evil.com", "/\\evil.com" or "https://evil.com").
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}
