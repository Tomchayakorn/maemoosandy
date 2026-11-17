/**
 * Thai birth-day astrology: วันเกิด (with Wednesday-night / ราหู), ทักษา positions,
 * อักษรกาลกิณี and day colours. Pure — safe on server and client.
 *
 * The Thai astrological day starts at sunrise (taken as 06:00): someone born at
 * 03:00 on Thursday counts as Wednesday night (ราหู).
 */
import type { CEDate } from "./calendar";

export type TaksaDay = "sun" | "mon" | "tue" | "wed" | "wedNight" | "thu" | "fri" | "sat";

export const DAY_INFO: Record<TaksaDay, { th: string; number: number; color: string; letters: string }> = {
  sun: { th: "วันอาทิตย์", number: 1, color: "แดง", letters: "อะาำิีึืุูเแโใไั็" },
  mon: { th: "วันจันทร์", number: 2, color: "เหลือง", letters: "กขฃคฅฆง" },
  tue: { th: "วันอังคาร", number: 3, color: "ชมพู", letters: "จฉชซฌญ" },
  wed: { th: "วันพุธ (กลางวัน)", number: 4, color: "เขียว", letters: "ฎฏฐฑฒณ" },
  sat: { th: "วันเสาร์", number: 7, color: "ม่วง", letters: "ดตถทธน" },
  thu: { th: "วันพฤหัสบดี", number: 5, color: "ส้ม", letters: "บปผฝพฟภม" },
  wedNight: { th: "วันพุธ (กลางคืน · ราหู)", number: 8, color: "เทาดำ", letters: "ยรลว" },
  fri: { th: "วันศุกร์", number: 6, color: "ฟ้า", letters: "ศษสหฬฮ" },
};

/** Order of the ทักษา wheel. */
const TAKSA_ORDER: TaksaDay[] = ["sun", "mon", "tue", "wed", "sat", "thu", "wedNight", "fri"];

export const TAKSA_POSITIONS = ["บริวาร", "อายุ", "เดช", "ศรี", "มูละ", "อุตสาหะ", "มนตรี", "กาลกิณี"] as const;
export type TaksaPosition = (typeof TAKSA_POSITIONS)[number];

const WEEKDAYS: TaksaDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Parse "HH:MM" (24h). Returns minutes since midnight, or null. */
export function parseTime(time: string | undefined | null): number | null {
  if (!time) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Calendar weekday of a Gregorian date (timezone-independent). */
export function weekdayOf(d: CEDate): TaksaDay {
  return WEEKDAYS[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
}

export type BirthDay = {
  day: TaksaDay;
  /** True when the birth time moved the astrological day (before sunrise). */
  shiftedBeforeSunrise: boolean;
  /** True when no birth time was given, so Wednesday night couldn't be checked. */
  timeUnknown: boolean;
};

export function astrologicalBirthDay(d: CEDate, birthTime?: string | null): BirthDay {
  const minutes = parseTime(birthTime);
  if (minutes === null) return { day: weekdayOf(d), shiftedBeforeSunrise: false, timeUnknown: true };

  const SUNRISE = 6 * 60;
  const SUNSET = 18 * 60;
  let date = d;
  let shifted = false;
  if (minutes < SUNRISE) {
    const prev = new Date(Date.UTC(d.year, d.month - 1, d.day - 1));
    date = { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1, day: prev.getUTCDate() };
    shifted = true;
  }
  let day = weekdayOf(date);
  if (day === "wed" && (shifted || minutes >= SUNSET)) day = "wedNight";
  return { day, shiftedBeforeSunrise: shifted, timeUnknown: false };
}

export type Taksa = Record<TaksaPosition, TaksaDay>;

export function taksaFor(day: TaksaDay): Taksa {
  const start = TAKSA_ORDER.indexOf(day);
  const out = {} as Taksa;
  TAKSA_POSITIONS.forEach((pos, i) => {
    out[pos] = TAKSA_ORDER[(start + i) % TAKSA_ORDER.length];
  });
  return out;
}

/** Characters in `text` that are กาลกิณี for someone born on `day`. */
export function kalakiniLetters(text: string, day: TaksaDay): string[] {
  const banned = DAY_INFO[taksaFor(day)["กาลกิณี"]].letters;
  const found = new Set<string>();
  for (const ch of text.normalize("NFC")) if (banned.includes(ch)) found.add(ch);
  return [...found];
}

/** Lucky / unlucky colours from the ทักษา wheel. */
export function taksaColors(day: TaksaDay) {
  const t = taksaFor(day);
  return {
    birthDay: DAY_INFO[day].color,
    sri: DAY_INFO[t["ศรี"]].color, // โชคลาภ เงินทอง
    det: DAY_INFO[t["เดช"]].color, // อำนาจ บารมี
    ayu: DAY_INFO[t["อายุ"]].color, // สุขภาพ
    avoid: DAY_INFO[t["กาลกิณี"]].color, // ควรเลี่ยง
  };
}
