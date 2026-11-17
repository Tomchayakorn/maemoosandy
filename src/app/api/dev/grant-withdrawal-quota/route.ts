import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin";
import { apiError, requireUser } from "@/lib/api/respond";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantLocalQuota, localFallbackEnabled, shouldUseLocalWithdrawals } from "@/lib/withdrawals-local";

/** TESTING ONLY: admin grants themselves 1 jackpot-withdrawal right. 404 in production. */
export async function POST() {
  if (!localFallbackEnabled()) return apiError(404, "NOT_FOUND", "ไม่พบหน้านี้");
  const { user, response } = await requireUser();
  if (!user) return response;
  if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
  const admin = createAdminClient();
  if (await shouldUseLocalWithdrawals(admin)) {
    return NextResponse.json({ quota: await grantLocalQuota(user.id), store: "local" });
  }
  for (let i = 0; i < 6; i++) {
    const { data: w } = await admin.from("wallets").select("jackpot_withdrawals_available").eq("user_id", user.id).maybeSingle();
    if (!w) return apiError(404, "WALLET_NOT_FOUND", "ไม่พบกระเป๋าเหรียญ");
    const cur = w.jackpot_withdrawals_available ?? 0;
    const { data: u } = await admin.from("wallets").update({ jackpot_withdrawals_available: cur + 1 }).eq("user_id", user.id).eq("jackpot_withdrawals_available", cur).select("jackpot_withdrawals_available");
    if (u?.length === 1) return NextResponse.json({ quota: u[0].jackpot_withdrawals_available, store: "db" });
  }
  return apiError(500, "INTERNAL", "ลองใหม่อีกครั้ง");
}
