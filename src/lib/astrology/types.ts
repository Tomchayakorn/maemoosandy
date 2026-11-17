import type { BirthProfile } from "./profile";

/** Successful body of POST /api/fortune/birthdate. */
export type BirthdateResponse = {
  profile: BirthProfile;
  reading: string;
  balance: number;
  freeReadingTickets: number;
  usedFreeTicket: boolean;
};
