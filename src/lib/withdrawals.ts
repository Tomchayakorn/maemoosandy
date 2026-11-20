/** Client-safe constants for the 5,000 THB jackpot cash withdrawal. */
export const WITHDRAW_COINS = 5000;
export const WITHDRAW_THB = 5000;

export const WITHDRAW_STATUS_LABEL = {
  pending: "รอดำเนินการตรวจสอบ",
  approved: "โอนเงินสำเร็จ",
  rejected: "ปฏิเสธ (คืนเหรียญแล้ว)",
} as const;

/** Label of a withdrawal request by where it came from (shown in the history and the admin page). */
export const WITHDRAW_SOURCE_LABEL = {
  jackpot: "ถอนรางวัลแจ็กพอตกงล้อ (5,000 เหรียญ = 5,000 บาท)",
  lucky_card: "ถอนรางวัลลับ “เทพประทานทรัพย์” (ดวงดี มีเฮ)",
  lucky_card_bonus: "ถอนโบนัสสะสม 1,000 เหรียญ = 1,000 บาท (ดวงดี มีเฮ)",
} as const;
export type WithdrawSource = keyof typeof WITHDRAW_SOURCE_LABEL;

export const THAI_BANKS = [
  "กสิกรไทย (KBank)",
  "ไทยพาณิชย์ (SCB)",
  "กรุงเทพ (BBL)",
  "กรุงไทย (KTB)",
  "กรุงศรีอยุธยา (BAY)",
  "ทหารไทยธนชาต (ttb)",
  "ออมสิน (GSB)",
  "ธ.ก.ส. (BAAC)",
  "ยูโอบี (UOB)",
  "ซีไอเอ็มบี ไทย (CIMB)",
  "อื่นๆ",
] as const;
