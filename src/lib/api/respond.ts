import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { parseRpcError, type RpcErrorCode } from "@/types/database";

/** Shape of every error body returned by our API routes. */
export type ApiErrorBody = { error: { code: string; message: string } };

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

const RPC_ERROR_HTTP: Record<RpcErrorCode, { status: number; message: string }> = {
  INSUFFICIENT_COINS: { status: 402, message: "เหรียญไม่เพียงพอ เติมเหรียญเสริมบารมีก่อนนะคะ" },
  NO_FREE_READING_TICKETS: { status: 402, message: "สิทธิ์ดูดวงฟรีหมดแล้วค่ะ" },
  NO_SPIN_TICKETS: { status: 402, message: "สิทธิ์หมุนกงล้อหมดแล้ว เช็กอินพรุ่งนี้รับสิทธิ์ใหม่นะคะ" },
  SLIP_ALREADY_USED: { status: 409, message: "สลิปนี้ถูกใช้เติมเหรียญไปแล้วค่ะ" },
  WALLET_NOT_FOUND: { status: 404, message: "ไม่พบกระเป๋าเหรียญของบัญชีนี้" },
  MISSING_SLIP_REF: { status: 400, message: "อ่านข้อมูลสลิปไม่ได้ กรุณาลองใหม่" },
  INVALID_AMOUNT: { status: 400, message: "จำนวนไม่ถูกต้อง" },
  INVALID_REASON: { status: 400, message: "คำขอไม่ถูกต้อง" },
  INVALID_REWARD: { status: 400, message: "รางวัลไม่ถูกต้อง" },
  LEDGER_NOT_FOUND: { status: 404, message: "ไม่พบรายการ" },
  NOT_REFUNDABLE: { status: 400, message: "รายการนี้คืนเหรียญไม่ได้" },
  NO_WITHDRAWAL_QUOTA: { status: 403, message: "คุณไม่มีสิทธิ์ถอนรางวัลแจ็กพอต" },
  WITHDRAWAL_NOT_FOUND: { status: 404, message: "ไม่พบคำขอถอน" },
  WITHDRAWAL_ALREADY_REVIEWED: { status: 409, message: "คำขอนี้ถูกดำเนินการไปแล้ว" },
  PRIZE_NOT_FOUND: { status: 404, message: "ไม่พบสิทธิ์รางวัลนี้" },
  PRIZE_ALREADY_WITHDRAWN: { status: 409, message: "สิทธิ์รางวัลนี้ถูกถอนไปแล้ว" },
  INVALID_OUTCOME: { status: 400, message: "ผลรางวัลไม่ถูกต้อง" },
  INVALID_CARD: { status: 400, message: "เลือกไพ่ไม่ถูกต้อง" },
  INVALID_COST: { status: 400, message: "คำขอไม่ถูกต้อง" },
};

/** Convert a Supabase RPC error into a Thai API error response. */
export function rpcErrorResponse(error: { message?: string; code?: string; details?: string | null; hint?: string | null } | null) {
  const code = parseRpcError(error?.message);
  if (code) {
    const { status, message } = RPC_ERROR_HTTP[code];
    return apiError(status, code, message);
  }
  console.error("Unexpected RPC error:", { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
  // PGRST202 / 42883 = the SQL function is missing: a migration has not been run on this database.
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return apiError(503, "DB_MIGRATION_MISSING", "ระบบหมุนกงล้อยังตั้งค่าฐานข้อมูลไม่ครบ กรุณาแจ้งผู้ดูแล (ยังไม่มีการหักเหรียญ)");
  }
  return apiError(500, "INTERNAL", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง");
}

/** The verified signed-in user, or a 401 response to return as-is. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: apiError(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนนะคะ") } as const;
  }
  return { user, response: null } as const;
}

/** Parse and validate a JSON body. Returns data, or a 400 response. */
export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, response: apiError(400, "BAD_JSON", "ข้อมูลที่ส่งมาไม่ถูกต้อง") } as const;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "ข้อมูลที่ส่งมาไม่ถูกต้อง";
    return { data: null, response: apiError(400, "VALIDATION", message) } as const;
  }
  return { data: parsed.data as z.infer<S>, response: null } as const;
}
