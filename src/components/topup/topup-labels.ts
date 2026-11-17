import { findPackage } from "@/lib/packages";
import type { SlipErrorCode } from "@/lib/slip/types";

export const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  success: { text: "สำเร็จ", className: "border-jade/50 bg-jade/15 text-[#9fe0c0]" },
  rejected: { text: "ไม่ผ่าน", className: "border-ruby/50 bg-ruby/15 text-[#f0b0b8]" },
  failed: { text: "ขัดข้อง", className: "border-gold/40 bg-gold/10 text-gold-light" },
  pending: { text: "รอตรวจ", className: "border-gold/40 bg-gold/10 text-gold-light" },
};

const REASON_SHORT: Partial<Record<SlipErrorCode, string>> = {
  BAD_IMAGE: "อ่านรูปไม่ได้",
  NOT_A_SLIP: "ไม่พบข้อมูลการโอน",
  SLIP_PENDING: "ธนาคารยังไม่อัปเดต",
  DUPLICATE: "สลิปซ้ำ",
  AMOUNT_MISMATCH: "ยอดไม่ตรงแพ็กเกจ",
  RECEIVER_MISMATCH: "บัญชีผู้รับไม่ถูกต้อง",
  TOO_OLD: "สลิปเก่าเกินกำหนด",
  PROVIDER_ERROR: "ระบบตรวจสลิปขัดข้อง",
  NOT_CONFIGURED: "ระบบยังไม่พร้อม",
};

/** "AMOUNT_MISMATCH: slip 98 ≠ expected 99" → "ยอดไม่ตรงแพ็กเกจ" (customer-facing; no internals). */
export function shortReason(failureReason: string | null): string | null {
  if (!failureReason) return null;
  const code = failureReason.split(":")[0].trim() as SlipErrorCode;
  return REASON_SHORT[code] ?? null;
}

export function packageName(id: string): string {
  return findPackage(id)?.name ?? id;
}

export function formatThaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}
