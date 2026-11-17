/** Client-safe constants for the 5,000 THB jackpot cash withdrawal. */
export const WITHDRAW_COINS = 5000;
export const WITHDRAW_THB = 5000;

export const WITHDRAW_STATUS_LABEL = {
  pending: "รอดำเนินการตรวจสอบ",
  approved: "โอนเงินสำเร็จ",
  rejected: "ปฏิเสธ (คืนเหรียญแล้ว)",
} as const;

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
