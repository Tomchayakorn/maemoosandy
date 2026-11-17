"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

/**
 * Supabase client for Client Components.
 * Uses the publishable (anon) key — RLS only allows reading the user's own rows.
 * Never mutate wallets / logs from here: all coin & ticket changes go through API routes.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
