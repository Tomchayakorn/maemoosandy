/** Thai (Buddhist Era) / Gregorian calendar helpers. Pure — safe on server and client. */

export const BE_OFFSET = 543;
export type CalendarKind = "BE" | "CE";

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

export const MIN_YEAR_CE = 1900;

export function toCE(year: number, calendar: CalendarKind): number {
  return calendar === "BE" ? year - BE_OFFSET : year;
}

export function toBE(yearCE: number): number {
  return yearCE + BE_OFFSET;
}

export function daysInMonth(yearCE: number, month: number): number {
  return new Date(Date.UTC(yearCE, month, 0)).getUTCDate();
}

/** A calendar date in the Gregorian calendar (month 1–12). */
export type CEDate = { year: number; month: number; day: number };

export type BirthDateResult = { ok: true; date: CEDate } | { ok: false; error: string };

/**
 * Validate a birth date typed in either calendar. Catches the common mix-up of
 * typing a พ.ศ. year with ค.ศ. selected (and vice versa).
 */
export function parseBirthDate(
  input: { day: number; month: number; year: number; calendar: CalendarKind },
  today: Date = new Date(),
): BirthDateResult {
  const { day, month, year, calendar } = input;
  if (![day, month, year].every(Number.isInteger)) return { ok: false, error: "กรุณากรอกวันเดือนปีเกิดให้ครบค่ะ" };
  if (calendar === "CE" && year > 2400) return { ok: false, error: "ปีนี้ดูเหมือนเป็น พ.ศ. ลองเลือกปฏิทินเป็น พ.ศ. นะคะ" };
  if (calendar === "BE" && year < 2400) return { ok: false, error: "ปีนี้ดูเหมือนเป็น ค.ศ. ลองเลือกปฏิทินเป็น ค.ศ. นะคะ" };

  const yearCE = toCE(year, calendar);
  if (yearCE < MIN_YEAR_CE) return { ok: false, error: "ปีเกิดเก่าเกินไปค่ะ" };
  if (month < 1 || month > 12) return { ok: false, error: "เดือนไม่ถูกต้องค่ะ" };
  if (day < 1 || day > daysInMonth(yearCE, month)) return { ok: false, error: "วันที่นี้ไม่มีอยู่จริงในเดือนนั้นค่ะ" };

  const birth = Date.UTC(yearCE, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (birth > now) return { ok: false, error: "วันเกิดต้องไม่อยู่ในอนาคตค่ะ" };

  return { ok: true, date: { year: yearCE, month, day } };
}

export function formatThaiDate(d: CEDate): string {
  return `${d.day} ${THAI_MONTHS[d.month - 1]} พ.ศ. ${toBE(d.year)}`;
}

/** Whole years of age on `today`. */
export function ageOn(d: CEDate, today: Date = new Date()): number {
  let age = today.getFullYear() - d.year;
  const beforeBirthday = today.getMonth() + 1 < d.month || (today.getMonth() + 1 === d.month && today.getDate() < d.day);
  if (beforeBirthday) age -= 1;
  return age;
}
