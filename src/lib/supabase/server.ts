import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user (cookie session, RLS applies).
 *
 * With `cacheComponents` enabled, any component that calls this reads cookies,
 * so it must render inside a <Suspense> boundary.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: proxy.ts refreshes the session on every request.
          }
        },
      },
    },
  );
}

/**
 * Returns the verified user (validated against Supabase Auth), or null.
 * Always use this — never trust getSession() on the server.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
