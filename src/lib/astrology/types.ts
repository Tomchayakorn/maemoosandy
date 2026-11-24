import type { BirthProfile } from "./profile";

/** Successful body of POST /api/fortune/birthdate. */
export type BirthdateResponse = {
  profile: BirthProfile;
  reading: string;
  balance: number;
  freeReadingTickets: number;
  usedFreeTicket: boolean;
  /** the Thai date and time (from the server's clock) the reading was written for, e.g. "วันศุกร์ที่ 28 พฤศจิกายน พ.ศ. 2569 เวลา 14:05 น. (ช่วงบ่าย)" */
  asOf?: string;
};
