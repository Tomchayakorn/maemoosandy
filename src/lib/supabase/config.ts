/**
 * Public Supabase settings, safe on server and client.
 *
 * Both naming schemes are accepted:
 *   new:    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)
 *   legacy: NEXT_PUBLIC_SUPABASE_ANON_KEY        (anon JWT)
 * Each env var is referenced literally so Next.js can inline it into the browser bundle.
 * The server-only secret key is read in admin.ts, never here.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/** True when the public Supabase env vars are set. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * LINE login uses a Supabase custom OIDC provider (e.g. "custom:line").
 * The button is shown only when this is set.
 */
export const LINE_PROVIDER_ID = process.env.NEXT_PUBLIC_LINE_PROVIDER_ID || "";
