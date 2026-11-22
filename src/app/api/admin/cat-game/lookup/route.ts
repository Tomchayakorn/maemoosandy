import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin";
import { apiError, parseJsonBody, requireUser } from "@/lib/api/respond";
import { alertAdminError } from "@/lib/admin-alert";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { bangkokDate } from "@/lib/cat-game/config";
import { matchUser } from "@/lib/cat-game/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ query: z.string().trim().min(3, "กรอกอีเมลหรือรหัสผู้ใช้").max(200) });

export type CatGameLookupResponse = {
  userId: string;
  email: string | null;
  balance: number;
  today: string;
  play: { catIndex: number; reward: number; at: string } | null;
};

/** Admin only: find a player by exact email or user id and show today's "น้องเหมียว 9 ชีวิต" status. Read only. */
export async function POST(request: Request) {
  const ctx: { admin?: string } = {};
  try {
    return await lookup(request, ctx);
  } catch (e) {
    console.error("admin cat-game lookup: unhandled exception", e);
    await alertAdminError({ where: "POST /api/admin/cat-game/lookup (exception)", error: e, extra: ctx.admin ? `แอดมิน (admin id): ${ctx.admin}` : undefined });
    return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
  }
}

async function lookup(request: Request, ctx: { admin?: string }) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  if (!isAdminUser(user)) return apiError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึง");
  ctx.admin = user.id;
  const limited = rateLimitResponse(user.id, "adminReview");
  if (limited) return limited;
  const { data: body, response: bad } = await parseJsonBody(request, Body);
  if (!body) return bad;

  const admin = createAdminClient();
  // auth users have no email column we can query, so scan the user list page by page (capped) and match exactly
  let found: { id: string; email?: string | null } | null = null;
  for (let page = 1; page <= 20 && !found; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("admin cat-game lookup: listUsers failed", error.message);
      await alertAdminError({ where: "admin lookup: auth.admin.listUsers", error, extra: `แอดมิน (admin id): ${user.id}` });
      return apiError(500, "INTERNAL", "ค้นหาผู้ใช้ไม่สำเร็จ กรุณาลองใหม่");
    }
    found = matchUser(data.users, body.query);
    if (data.users.length < 1000) break;
  }
  if (!found) return apiError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้ที่ตรงกับอีเมลหรือรหัสนี้ (ต้องตรงทั้งหมด)");

  const today = bangkokDate(new Date());
  const [wallet, play] = await Promise.all([
    admin.from("wallets").select("balance").eq("user_id", found.id).maybeSingle(),
    admin.from("cat_game_plays").select("cat_index, reward_coins, created_at").eq("user_id", found.id).eq("play_date", today).maybeSingle(),
  ]);
  if (play.error) {
    console.error("admin cat-game lookup: cat_game_plays failed", play.error.message);
    await alertAdminError({ where: "admin lookup: อ่าน cat_game_plays", userId: found.id, error: play.error, extra: `แอดมิน (admin id): ${user.id}` });
    return apiError(503, "DB_MIGRATION_MISSING", "ยังไม่ได้รัน migration 0016 (ตาราง cat_game_plays)");
  }
  return NextResponse.json<CatGameLookupResponse>({
    userId: found.id,
    email: found.email ?? null,
    balance: wallet.data?.balance ?? 0,
    today,
    play: play.data ? { catIndex: play.data.cat_index, reward: play.data.reward_coins, at: play.data.created_at } : null,
  });
}
