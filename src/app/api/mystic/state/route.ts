import { connection } from "next/server";
import { NextResponse } from "next/server";
import { alertAdminError } from "@/lib/admin-alert";
import { apiError, requireUser } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { loadMysticState } from "@/lib/mystic/server";
import type { MysticRoundView } from "@/lib/mystic/types";

export type MysticStateResponse = { round: MysticRoundView | null; balance: number };

/** The player's unfinished round and balance (server truth). The cursed positions are never included. Read only. */
export async function GET() {
  // reads the session cookie: must run per request, never during the build's prerender (which would also run the alert path below)
  await connection();
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    const limited = rateLimitResponse(user.id, "mysticOpen");
    if (limited) return limited;
    const s = await loadMysticState(user.id);
    if (s.unavailable) return apiError(503, "DB_MIGRATION_MISSING", "ระบบเกมยังตั้งค่าฐานข้อมูลไม่ครบ กรุณาแจ้งผู้ดูแล");
    return NextResponse.json<MysticStateResponse>({ round: s.round, balance: s.balance });
  } catch (e) {
    console.error("mystic state failed", e);
    await alertAdminError({ where: "GET /api/mystic/state (exception)", error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
