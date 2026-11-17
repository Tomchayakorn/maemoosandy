import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { generateReading, isAiConfigured } from "@/lib/ai/engine";
import { MAE_MU_SANDY_SYSTEM } from "@/lib/ai/persona";
import { computeBirthProfile, FOCUS_LABEL } from "@/lib/astrology/profile";
import { buildBirthdatePrompt } from "@/lib/astrology/prompt";
import { FORTUNE_PRICES } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BirthdateResponse } from "@/lib/astrology/types";

// Claude: up to 75s plus one SDK retry; Gemini: up to three models × 25s.
export const maxDuration = 120;

const NAME_RE = /^[\p{Script=Thai}A-Za-z .'-]+$/u;

const bodySchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "กรุณากรอกชื่อจริงค่ะ")
    .max(60, "ชื่อยาวเกินไปค่ะ")
    .regex(NAME_RE, "ชื่อใช้ได้เฉพาะตัวอักษรไทยหรืออังกฤษค่ะ"),
  lastName: z
    .string()
    .trim()
    .min(1, "กรุณากรอกนามสกุลค่ะ")
    .max(60, "นามสกุลยาวเกินไปค่ะ")
    .regex(NAME_RE, "นามสกุลใช้ได้เฉพาะตัวอักษรไทยหรืออังกฤษค่ะ"),
  day: z.number().int(),
  month: z.number().int(),
  year: z.number().int(),
  calendar: z.enum(["BE", "CE"]),
  birthTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาเกิดไม่ถูกต้องค่ะ")
    .nullish(),
  focus: z.enum(["overall", "career", "love"]),
  useFreeTicket: z.boolean().optional().default(false),
});


export async function POST(request: Request) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "birthdate");
  if (limited) return limited;

  const { data: body, response: invalid } = await parseJsonBody(request, bodySchema);
  if (!body) return invalid;

  // All astrology is computed here on the server — the client only sends raw inputs.
  const computed = computeBirthProfile({ ...body, birthTime: body.birthTime ?? null });
  if (!computed.ok) return apiError(400, "INVALID_BIRTHDATE", computed.error);
  const profile = computed.profile;

  if (!isAiConfigured()) {
    return apiError(503, "AI_NOT_CONFIGURED", "แม่มูยังไม่พร้อมตรวจดวงในขณะนี้ กรุณาลองใหม่ภายหลังค่ะ");
  }

  const admin = createAdminClient();

  // 1) Charge: 199 coins or one free-reading ticket (atomic, server-priced).
  const charge = body.useFreeTicket
    ? await admin.rpc("use_free_reading_ticket", { p_user_id: user.id, p_reason: "birthdate" })
    : await admin.rpc("spend_coins", { p_user_id: user.id, p_amount: FORTUNE_PRICES.birthdate, p_reason: "birthdate" });
  if (charge.error) return rpcErrorResponse(charge.error);
  const ledgerId = (charge.data as { ledger_id: string }).ledger_id;

  // 2) Ask Mae Mu Sandy.
  let reading: string;
  try {
    reading = await generateReading({ system: MAE_MU_SANDY_SYSTEM, prompt: buildBirthdatePrompt(profile) });
  } catch (err) {
    console.error("birthdate: AI generation failed", err);
    const refund = await admin.rpc("refund_coins", { p_ledger_id: ledgerId });
    if (refund.error) console.error("birthdate: REFUND FAILED for ledger", ledgerId, refund.error.message);
    return apiError(
      503,
      "AI_FAILED",
      body.useFreeTicket
        ? "แม่มูตรวจดวงไม่สำเร็จในครั้งนี้ คืนสิทธิ์ดูดวงฟรีให้แล้ว ลองใหม่อีกครั้งนะคะ"
        : "แม่มูตรวจดวงไม่สำเร็จในครั้งนี้ คืนเหรียญให้ครบแล้ว ลองใหม่อีกครั้งนะคะ",
    );
  }

  // 3) Log (the user already paid and got the reading, so a log failure isn't fatal).
  const log = await admin.from("fortune_logs").insert({
    user_id: user.id,
    fortune_type: "birthdate",
    question: FOCUS_LABEL[profile.focus],
    input: JSON.parse(JSON.stringify(profile)),
    result_text: reading,
    coins_spent: body.useFreeTicket ? 0 : FORTUNE_PRICES.birthdate,
    used_free_ticket: body.useFreeTicket,
    ledger_id: ledgerId,
  });
  if (log.error) console.error("birthdate: fortune_logs insert failed", log.error.message);

  const { data: wallet } = await admin
    .from("wallets")
    .select("balance, free_reading_tickets")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json<BirthdateResponse>({
    profile,
    reading,
    balance: wallet?.balance ?? 0,
    freeReadingTickets: wallet?.free_reading_tickets ?? 0,
    usedFreeTicket: body.useFreeTicket,
  });
}
