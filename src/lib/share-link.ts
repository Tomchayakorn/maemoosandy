/**
 * The link the "share" button always gives out: the site's MAIN address (origin only), never a game page or a query string.
 * `configured` is NEXT_PUBLIC_APP_URL (the real domain, set at deploy); `fallbackOrigin` is window.location.origin.
 */
export function mainShareUrl(configured: string | undefined | null, fallbackOrigin: string): string {
  for (const raw of [configured, fallbackOrigin]) {
    if (!raw) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "http:" || u.protocol === "https:") return `${u.origin}/`;
    } catch {
      /* not a URL: try the next candidate */
    }
  }
  return "/";
}

export const SHARE_TITLE = "แม่มูแซนดี้ ทำนายดวงชะตา บ้าน ณ มัณตรา";
export const SHARE_TEXT = "ดูดวง ไพ่ยิปซี หมุนวงล้อ เล่นเกมมงคลกับแม่มูแซนดี้";
