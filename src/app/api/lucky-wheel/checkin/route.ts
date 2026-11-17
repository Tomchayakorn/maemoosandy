import { NextResponse } from "next/server";
import { requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CheckinResponse } from "@/lib/wheel/segments";

/** Daily check-in: +1 spin ticket once per Bangkok calendar day (idempotent in the RPC). */
export async function POST() {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "wheelCheckin");
  if (limited) return limited;

  const { data, error } = await createAdminClient().rpc("daily_checkin", { p_user_id: user.id });
  if (error) return rpcErrorResponse(error);

  const row = data as { granted: boolean; spin_tickets: number };
  return NextResponse.json<CheckinResponse>({ granted: row.granted, spinTickets: row.spin_tickets });
}
