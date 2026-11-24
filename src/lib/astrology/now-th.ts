/**
 * "Now" in Thai time, for the readings: the weekday / date / Buddhist-era year / time of day, and the Thai astrological day that is running
 * at this moment (the day changes at 06:00 and Wednesday night is ราหู, exactly as for a birth day). Pure — the caller passes the clock
 * (the server's, never the client's). Asia/Bangkok has no DST: UTC+7 all year.
 *
 * Also relates "today" to a person's base chart: which ทักษา position today's day falls on for that person (a computed fact the AI is
 * told, not something it has to work out).
 */
import { BE_OFFSET, THAI_MONTHS, type CEDate } from "./calendar";
import { astrologicalBirthDay, DAY_INFO, type TaksaDay } from "./taksa";

const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const WEEKDAY_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"] as const;

/** The calendar date and clock time in Bangkok for an instant. */
export function bangkokParts(now: Date): { date: CEDate; hour: number; minute: number; weekdayIndex: number } {
  const t = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return {
    date: { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() },
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    weekdayIndex: t.getUTCDay(),
  };
}

/** Part of the day in Thai, by the Bangkok hour. */
export function dayPartOf(hour: number): string {
  if (hour < 4) return "ดึก";
  if (hour < 6) return "ใกล้รุ่ง";
  if (hour < 11) return "เช้า";
  if (hour < 13) return "เที่ยง";
  if (hour < 16) return "บ่าย";
  if (hour < 18) return "เย็น";
  if (hour < 21) return "ค่ำ";
  return "ดึก";
}

export type ThaiNow = {
  /** YYYY-MM-DD in Bangkok */
  isoDate: string;
  weekdayTh: string;
  day: number;
  monthTh: string;
  yearBE: number;
  /** "14:05" */
  hhmm: string;
  dayPart: string;
  /** the Thai astrological day running now (06:00 start, Wednesday night = ราหู) */
  astroDay: TaksaDay;
  astroDayTh: string;
  /** "วันศุกร์ที่ 28 พฤศจิกายน พ.ศ. 2569 เวลา 14:05 น. (ช่วงบ่าย)" */
  label: string;
};

export function thaiNow(now: Date = new Date()): ThaiNow {
  const p = bangkokParts(now);
  const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  const astro = astrologicalBirthDay(p.date, hhmm);
  const weekdayTh = WEEKDAY_TH[p.weekdayIndex];
  const monthTh = THAI_MONTHS[p.date.month - 1];
  const yearBE = p.date.year + BE_OFFSET;
  const dayPart = dayPartOf(p.hour);
  return {
    isoDate: `${p.date.year}-${String(p.date.month).padStart(2, "0")}-${String(p.date.day).padStart(2, "0")}`,
    weekdayTh,
    day: p.date.day,
    monthTh,
    yearBE,
    hhmm,
    dayPart,
    astroDay: astro.day,
    astroDayTh: DAY_INFO[astro.day].th,
    label: `วัน${weekdayTh}ที่ ${p.date.day} ${monthTh} พ.ศ. ${yearBE} เวลา ${hhmm} น. (ช่วง${dayPart})`,
  };
}

/** What each ทักษา position stands for in daily life (short; the AI expands it). */
export const TAKSA_MEANING: Record<string, { meaning: string; tone: "favourable" | "supportive" | "caution" }> = {
  บริวาร: { meaning: "คนรอบข้าง เพื่อนฝูง ลูกน้อง การมีผู้ช่วย", tone: "supportive" },
  อายุ: { meaning: "สุขภาพ พลังกายและใจ ความต่อเนื่อง", tone: "supportive" },
  เดช: { meaning: "อำนาจ บารมี การตัดสินใจ การนำ", tone: "favourable" },
  ศรี: { meaning: "โชคลาภ เสน่ห์ ความราบรื่น ความสบายใจ", tone: "favourable" },
  มูละ: { meaning: "ทรัพย์สิน รากฐาน งานหลัก ของที่สะสมไว้", tone: "favourable" },
  อุตสาหะ: { meaning: "ความขยัน ความพยายาม การลงมือทำ", tone: "supportive" },
  มนตรี: { meaning: "ผู้ใหญ่ ผู้อุปถัมภ์ คำแนะนำดีๆ ผู้ช่วยเหลือ", tone: "favourable" },
  กาลกิณี: { meaning: "เรื่องที่ควรระวัง ควรชะลอ หลีกเลี่ยงการตัดสินใจใหญ่", tone: "caution" },
};

export type TodayRelation = {
  /** which position of the person's ทักษา wheel today's day falls on */
  position: string;
  meaning: string;
  tone: "favourable" | "supportive" | "caution";
  /** true when today's astrological day is the person's own birth day */
  isBirthDay: boolean;
};

/** Where today's astrological day sits on this person's ทักษา wheel. `taksa` is BirthProfile["taksa"] ({position, day (Thai name)}). */
export function todayRelation(taksa: ReadonlyArray<{ position: string; day: string }>, birthDayKey: TaksaDay, now: ThaiNow): TodayRelation | null {
  const hit = taksa.find((t) => t.day === now.astroDayTh);
  if (!hit) return null;
  const m = TAKSA_MEANING[hit.position];
  if (!m) return null;
  return { position: hit.position, meaning: m.meaning, tone: m.tone, isBirthDay: birthDayKey === now.astroDay };
}

/** True when today (Bangkok) is the person's birthday (same month and day). */
export function isBirthdayToday(birth: CEDate, nowDate: CEDate): boolean {
  return birth.month === nowDate.month && birth.day === nowDate.day;
}
