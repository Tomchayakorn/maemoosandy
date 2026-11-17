import type { PackageId } from "../packages";

/** Provider-neutral result of reading a Thai bank-transfer slip. */

export type SlipErrorCode =
  | "NOT_CONFIGURED" // no provider / API key set up
  | "BAD_IMAGE" // not an image, too large, unreadable
  | "NOT_A_SLIP" // no payment QR / fake / transaction doesn't exist
  | "SLIP_PENDING" // bank needs a few minutes before the slip can be verified
  | "DUPLICATE" // provider says this slip was already used
  | "AMOUNT_MISMATCH"
  | "RECEIVER_MISMATCH"
  | "TOO_OLD"
  | "PROVIDER_ERROR"; // quota, auth, outage — not the customer's fault

export type SlipData = {
  provider: string;
  /** Bank transaction reference — unique per transfer; used to block reuse. */
  transRef: string;
  amount: number;
  /** ISO timestamp of the transfer, if the provider returns it. */
  paidAt: string | null;
  receiverName: string | null;
  /** Masked account/proxy as printed on the slip, e.g. "xxx-x-x3109-x". */
  receiverAccount: string | null;
  /** true/false when the provider matched the receiver against our registered account; null if not checked. */
  receiverMatched: boolean | null;
  /** Provider's own id for this verification (if any). */
  providerRef: string | null;
};

export type SlipResult = { ok: true; slip: SlipData } | { ok: false; code: SlipErrorCode; detail?: string };

export type VerifyInput = {
  file: Blob;
  fileName: string;
  /** Amount the customer should have paid (from the package). */
  expectedAmount: number;
};

export interface SlipProvider {
  name: string;
  verify(input: VerifyInput): Promise<SlipResult>;
}

/** Successful body of POST /api/topup/verify. */
export type TopupVerifyResponse = {
  ok: true;
  coinsAdded: number;
  balance: number;
  /** The same customer re-sent a slip that was already credited — nothing was added this time. */
  alreadyCredited: boolean;
  packageId: PackageId;
};

/** Thai messages for customers, per error code. */
export const SLIP_ERROR_MESSAGE: Record<SlipErrorCode, string> = {
  NOT_CONFIGURED: "ระบบตรวจสลิปยังไม่พร้อมใช้งาน กรุณาติดต่อแอดมินค่ะ",
  BAD_IMAGE: "อ่านไฟล์สลิปไม่ได้ กรุณาอัปโหลดรูปสลิปที่ชัด (JPG/PNG/WEBP ไม่เกิน 4MB) ค่ะ",
  NOT_A_SLIP: "ไม่พบข้อมูลการโอนในรูปนี้ กรุณาอัปโหลดสลิปที่เห็น QR Code ชัดเจนค่ะ",
  SLIP_PENDING: "ธนาคารยังไม่อัปเดตรายการนี้ รอประมาณ 5 นาทีแล้วลองส่งสลิปอีกครั้งนะคะ",
  DUPLICATE: "สลิปนี้ถูกใช้งานไปแล้ว กรุณาใช้สลิปใหม่",
  AMOUNT_MISMATCH: "ยอดเงินในสลิปไม่ตรงกับแพ็กเกจที่เลือกค่ะ กรุณาเลือกแพ็กเกจให้ตรงกับยอดที่โอน",
  RECEIVER_MISMATCH: "บัญชีผู้รับในสลิปไม่ใช่บัญชีของบ้าน ณ มัณตรา ค่ะ",
  TOO_OLD: "สลิปนี้เก่าเกินกำหนด กรุณาติดต่อแอดมินพร้อมสลิปค่ะ",
  PROVIDER_ERROR: "ระบบตรวจสลิปขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่ค่ะ",
};
