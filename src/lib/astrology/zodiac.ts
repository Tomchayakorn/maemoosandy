/** ปีนักษัตร and ราศี. Pure — safe on server and client. */
import type { CEDate } from "./calendar";

/**
 * When the ปีนักษัตร changes. Thai almanacs commonly switch at Songkran
 * (13 April); change this one constant to use another convention.
 */
export const ZODIAC_YEAR_START = { month: 4, day: 13 } as const;

export const CHINESE_ZODIAC = [
  { th: "ชวด", animal: "หนู" },
  { th: "ฉลู", animal: "วัว" },
  { th: "ขาล", animal: "เสือ" },
  { th: "เถาะ", animal: "กระต่าย" },
  { th: "มะโรง", animal: "งูใหญ่" },
  { th: "มะเส็ง", animal: "งูเล็ก" },
  { th: "มะเมีย", animal: "ม้า" },
  { th: "มะแม", animal: "แพะ" },
  { th: "วอก", animal: "ลิง" },
  { th: "ระกา", animal: "ไก่" },
  { th: "จอ", animal: "สุนัข" },
  { th: "กุน", animal: "หมู" },
] as const;

const RAT_YEAR = 2020; // 2020 CE was a ปีชวด

export type ChineseZodiac = (typeof CHINESE_ZODIAC)[number] & {
  /** The Gregorian year the ปีนักษัตร is counted from. */
  zodiacYear: number;
  /** Born before the switch date, so the previous year's animal applies. */
  beforeYearStart: boolean;
};

export function chineseZodiac(d: CEDate): ChineseZodiac {
  const before = d.month < ZODIAC_YEAR_START.month || (d.month === ZODIAC_YEAR_START.month && d.day < ZODIAC_YEAR_START.day);
  const zodiacYear = before ? d.year - 1 : d.year;
  const idx = (((zodiacYear - RAT_YEAR) % 12) + 12) % 12;
  return { ...CHINESE_ZODIAC[idx], zodiacYear, beforeYearStart: before };
}

type SignRange = { th: string; start: [number, number] }; // [month, day] the sign begins

/** Thai sidereal ราศี (นิรายนะ) as used in Thai horoscopes: the sun enters เมษ around 13–14 April. */
const THAI_SIGNS: SignRange[] = [
  { th: "มังกร", start: [1, 14] },
  { th: "กุมภ์", start: [2, 13] },
  { th: "มีน", start: [3, 14] },
  { th: "เมษ", start: [4, 13] },
  { th: "พฤษภ", start: [5, 15] },
  { th: "เมถุน", start: [6, 15] },
  { th: "กรกฎ", start: [7, 15] },
  { th: "สิงห์", start: [8, 17] },
  { th: "กันย์", start: [9, 17] },
  { th: "ตุลย์", start: [10, 17] },
  { th: "พิจิก", start: [11, 16] },
  { th: "ธนู", start: [12, 16] },
];

/** Western tropical signs (สายนะ), for people who know their "international" sign. */
const WESTERN_SIGNS: SignRange[] = [
  { th: "มังกร", start: [1, 1] }, // continues from 22 Dec
  { th: "กุมภ์", start: [1, 20] },
  { th: "มีน", start: [2, 19] },
  { th: "เมษ", start: [3, 21] },
  { th: "พฤษภ", start: [4, 20] },
  { th: "เมถุน", start: [5, 21] },
  { th: "กรกฎ", start: [6, 21] },
  { th: "สิงห์", start: [7, 23] },
  { th: "กันย์", start: [8, 23] },
  { th: "ตุลย์", start: [9, 23] },
  { th: "พิจิก", start: [10, 23] },
  { th: "ธนู", start: [11, 22] },
  { th: "มังกร", start: [12, 22] },
];

function signFor(table: SignRange[], d: CEDate, wrapSign: string): string {
  let current = wrapSign; // before the first start date of the year
  for (const s of table) {
    const [m, day] = s.start;
    if (d.month > m || (d.month === m && d.day >= day)) current = s.th;
  }
  return current;
}

export function thaiSign(d: CEDate): string {
  return `ราศี${signFor(THAI_SIGNS, d, "ธนู")}`;
}

export function westernSign(d: CEDate): string {
  return `ราศี${signFor(WESTERN_SIGNS, d, "มังกร")}`;
}
