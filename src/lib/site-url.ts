/**
 * Public base URL of the site, used for links we put in LINE admin notifications.
 * NEXT_PUBLIC_APP_URL wins (set it in Vercel); otherwise the production domain below.
 * One helper for every notifying route so a link can never differ between features.
 */
export const DEFAULT_SITE_URL = "https://maemoosandy-7mp3.vercel.app";

export function normalizeSiteUrl(raw: string | undefined | null, fallback = DEFAULT_SITE_URL): string {
  const v = raw?.trim();
  if (!v) return fallback;
  const withProtocol = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getSiteUrl(): string {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL);
}
