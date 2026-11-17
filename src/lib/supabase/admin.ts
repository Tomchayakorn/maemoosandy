import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_URL } from "./config";

/**
 * Service-role Supabase client. SERVER ONLY.
 *
 * This is the only client allowed to call the coin / ticket RPCs
 * (spend_coins, refund_coins, credit_topup, spin_wheel, daily_checkin,
 * use_free_reading_ticket) — they are granted to `service_role` only.
 *
 * Always verify the user with getCurrentUser() first and pass that user's id;
 * never take a user id from the request body.
 */
export function createAdminClient() {
  // New name (sb_secret_...) or legacy service_role key — both work.
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !secret) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  return createClient<Database>(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
