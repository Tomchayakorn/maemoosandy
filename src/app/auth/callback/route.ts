import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * OAuth (Google / LINE) and email-confirmation landing route.
 * Exchanges the PKCE `code` for a session cookie, then sends the user on to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("auth callback: exchangeCodeForSession failed", error.message);
  }

  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
