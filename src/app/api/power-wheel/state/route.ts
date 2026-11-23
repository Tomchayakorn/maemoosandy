import { connection } from "next/server";
import { NextResponse } from "next/server";
import { alertAdminError } from "@/lib/admin-alert";
import { apiError, requireUser } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { loadPowerState } from "@/lib/power-wheel/server";
import type { PowerRoundView } from "@/lib/power-wheel/types";

export type PowerStateResponse = { round: PowerRoundView | null; balance: number };

/** The player's unfinished round and balance (server truth). Read only. */
export async function GET() {
  // reads the session cookie: must run per request, never during the build's prerender
  await connection();
  try {
    const { user, response: unauthorized } = await requireUser();
    if (!user) return unauthorized;
    const limited = rateLimitResponse(user.id, "powerSpin");
    if (limited) return limited;
    const s = await loadPowerState(user.id);
    if (s.unavailable) return apiError(503, "DB_MIGRATION_MISSING", "ระบบเกมยังตั้งค่าฐานข้อมูลไม่ครบ กรุณาแจ้งผู้ดูแล");
    return NextResponse.json<PowerStateResponse>({ round: s.round, balance: s.balance });
  } catch (e) {
    console.error("power-wheel state failed", e);
    await alertAdminError({ where: "GET /api/power-wheel/state (exception)", error: e });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}
