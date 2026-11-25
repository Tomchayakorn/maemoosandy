import { connection } from "next/server";
import { NextResponse } from "next/server";
import { alertAdminError } from "@/lib/admin-alert";
import { apiError, requireUser } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { loadMatchState } from "@/lib/match-game/server";
import type { MatchStateResponse } from "@/lib/match-game/types";

/** The player's unfinished round, balance and rounds used today (server truth). Read only. */
export async function GET() {
  // reads the session cookie: must run per request, never during the build's prerender
  await connection();
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    const limited = rateLimitResponse(user.id, "matchState");
    if (limited) return limited;
    const s = await loadMatchState(user.id);
    if (s.unavailable) return apiError(503, "DB_MIGRATION_MISSING", "ระบบเกมยังตั้งค่าฐานข้อมูลไม่ครบ กรุณาแจ้งผู้ดูแล");
    // never cached: this is the truth the screen is reconciled with
    return NextResponse.json<MatchStateResponse>({ round: s.round, balance: s.balance, roundsToday: s.roundsToday }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("match-game state failed", e);
    await alertAdminError({ where: "GET /api/match-game/state (exception)", error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
