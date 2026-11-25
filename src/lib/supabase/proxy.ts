import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/** Pages that need a signed-in user. API routes check auth themselves. */
const PROTECTED_PREFIXES = ["/tarot", "/birthdate", "/topup", "/lucky-wheel", "/lucky-card", "/cat-game", "/mystic-chests", "/power-wheel", "/match-game", "/history", "/withdraw", "/admin"];

/**
 * Refreshes the Supabase auth session cookie on every request and does an
 * optimistic redirect to /login for protected pages. Real authorization happens
 * in route handlers / RPCs — this is only for UX.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response; // not configured yet (e.g. first local run)

  // If Supabase falls back to the Site URL (redirect URL not allow-listed), the
  // auth `code` lands on a normal page. Forward it to the callback route.
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode && request.nextUrl.pathname !== "/auth/callback") {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    callback.search = "";
    callback.searchParams.set("code", authCode);
    callback.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(callback);
  }

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({ name, value, ...options })
        })
      },
    },
  });

  // Do not put code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(loginUrl);
    // Keep any refreshed auth cookies on the redirect response.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // Signed-in users don't need the login page.
  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    const redirect = NextResponse.redirect(home);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
