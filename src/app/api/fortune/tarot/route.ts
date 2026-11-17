import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody, requireUser, rpcErrorResponse } from "@/lib/api/respond";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { generateReading, isAiConfigured } from "@/lib/ai/engine";
import { MAE_MU_SANDY_SYSTEM } from "@/lib/ai/persona";
import { FORTUNE_PRICES } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { drawThree } from "@/lib/tarot/draw";
import type { DrawnCardView, TarotResponse } from "@/lib/tarot/deck";

// Claude: up to 75s plus one SDK retry; Gemini: up to three models × 25s.
export const maxDuration = 120;

const bodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "พิมพ์คำถามที่อยากรู้อย่างน้อย 3 ตัวอักษรนะคะ")
    .max(300, "คำถามยาวเกินไป ขอไม่เกิน 300 ตัวอักษรค่ะ"),
  useFreeTicket: z.boolean().optional().default(false),
});

function buildPrompt(question: string, cards: DrawnCardView[]): string {
  const lines = cards.map(
    (c, i) =>
      `${i + 1}. ตำแหน่ง "${c.position}": ${c.nameTh}${c.isReversed ? " — ไพ่กลับหัว" : " — ไพ่หัวตั้ง"}\n   ความหมายหลัก: ${c.meaning}`,
  );
  return `ผู้ถามตั้งจิตอธิษฐานแล้วเปิดไพ่ยิปซี 3 ใบ (อดีต · ปัจจุบัน · อนาคต)

<question>${question}</question>

ไพ่ที่เปิดได้:
${lines.join("\n")}

ช่วยทำนายให้ตรงกับคำถาม โดยมีหัวข้อดังนี้
## ภาพรวมของคำถาม
## อดีต: ${cards[0].nameTh.replace(/\s*\(.*\)$/, "")}
## ปัจจุบัน: ${cards[1].nameTh.replace(/\s*\(.*\)$/, "")}
## อนาคต: ${cards[2].nameTh.replace(/\s*\(.*\)$/, "")}
## คำตอบจากแม่มู (สรุปคำตอบของคำถามอย่างตรงไปตรงมา)
## คำแนะนำเสริมดวงจากแม่มู
ความยาวรวมประมาณ 350-500 คำ`;
}

export async function POST(request: Request) {
  const { user, response: unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const limited = rateLimitResponse(user.id, "tarot");
  if (limited) return limited;

  const { data: body, response: invalid } = await parseJsonBody(request, bodySchema);
  if (!body) return invalid;

  // Don't charge if the AI engine can't run.
  if (!isAiConfigured()) {
    return apiError(503, "AI_NOT_CONFIGURED", "แม่มูยังไม่พร้อมเปิดไพ่ในขณะนี้ กรุณาลองใหม่ภายหลังค่ะ");
  }

  const admin = createAdminClient();

  // 1) Charge: 99 coins or one free-reading ticket (atomic, server-priced).
  const charge = body.useFreeTicket
    ? await admin.rpc("use_free_reading_ticket", { p_user_id: user.id, p_reason: "tarot" })
    : await admin.rpc("spend_coins", { p_user_id: user.id, p_amount: FORTUNE_PRICES.tarot, p_reason: "tarot" });
  if (charge.error) return rpcErrorResponse(charge.error);
  const ledgerId = (charge.data as { ledger_id: string }).ledger_id;

  // 2) Draw on the server, 3) ask Mae Mu Sandy.
  const cards = drawThree();
  let reading: string;
  try {
    reading = await generateReading({ system: MAE_MU_SANDY_SYSTEM, prompt: buildPrompt(body.question, cards) });
  } catch (err) {
    console.error("tarot: AI generation failed", err);
    const refund = await admin.rpc("refund_coins", { p_ledger_id: ledgerId });
    if (refund.error) console.error("tarot: REFUND FAILED for ledger", ledgerId, refund.error.message);
    return apiError(
      503,
      "AI_FAILED",
      body.useFreeTicket
        ? "แม่มูสื่อจิตไม่สำเร็จในครั้งนี้ คืนสิทธิ์ดูดวงฟรีให้แล้ว ลองใหม่อีกครั้งนะคะ"
        : "แม่มูสื่อจิตไม่สำเร็จในครั้งนี้ คืนเหรียญให้ครบแล้ว ลองใหม่อีกครั้งนะคะ",
    );
  }

  // 4) Log the reading (the user already paid and got the reading, so a log failure isn't fatal).
  const log = await admin.from("fortune_logs").insert({
    user_id: user.id,
    fortune_type: "tarot",
    question: body.question,
    input: { cards: cards.map(({ id, nameTh, isReversed, position }) => ({ id, nameTh, isReversed, position })) },
    result_text: reading,
    coins_spent: body.useFreeTicket ? 0 : FORTUNE_PRICES.tarot,
    used_free_ticket: body.useFreeTicket,
    ledger_id: ledgerId,
  });
  if (log.error) console.error("tarot: fortune_logs insert failed", log.error.message);

  const { data: wallet } = await admin
    .from("wallets")
    .select("balance, free_reading_tickets")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json<TarotResponse>({
    cards,
    reading,
    balance: wallet?.balance ?? 0,
    freeReadingTickets: wallet?.free_reading_tickets ?? 0,
    usedFreeTicket: body.useFreeTicket,
  });
}
