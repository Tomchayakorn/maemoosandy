/** Everything the birthdate reading needs, computed from name + date (+ optional time). */
import { ageOn, formatThaiDate, parseBirthDate, toBE, type CalendarKind, type CEDate } from "./calendar";
import { nameNumerology, type NameNumerology } from "./numerology";
import { astrologicalBirthDay, DAY_INFO, kalakiniLetters, taksaColors, taksaFor, TAKSA_POSITIONS, type TaksaDay } from "./taksa";
import { chineseZodiac, thaiSign, westernSign } from "./zodiac";

export type FocusTopic = "overall" | "career" | "love";

export const FOCUS_LABEL: Record<FocusTopic, string> = {
  overall: "ภาพรวมชีวิต",
  career: "การงานและการเงิน",
  love: "ความรัก",
};

export type BirthInput = {
  firstName: string;
  lastName: string;
  day: number;
  month: number;
  year: number;
  calendar: CalendarKind;
  birthTime?: string | null;
  focus: FocusTopic;
};

export type BirthProfile = {
  firstName: string;
  lastName: string;
  birthDate: CEDate;
  birthDateTh: string;
  birthYearBE: number;
  age: number;
  birthTime: string | null;
  numerology: NameNumerology;
  birthDay: {
    key: TaksaDay;
    th: string;
    number: number;
    timeUnknown: boolean;
    shiftedBeforeSunrise: boolean;
  };
  taksa: Array<{ position: string; day: string }>;
  kalakini: { first: string[]; last: string[] };
  colors: ReturnType<typeof taksaColors>;
  chineseZodiac: { th: string; animal: string; beforeYearStart: boolean };
  thaiSign: string;
  westernSign: string;
  focus: FocusTopic;
};

export type ProfileResult = { ok: true; profile: BirthProfile } | { ok: false; error: string };

export function computeBirthProfile(input: BirthInput, today: Date = new Date()): ProfileResult {
  const parsed = parseBirthDate(input, today);
  if (!parsed.ok) return parsed;
  const d = parsed.date;

  const firstName = input.firstName.trim().normalize("NFC");
  const lastName = input.lastName.trim().normalize("NFC");
  const birth = astrologicalBirthDay(d, input.birthTime);
  const taksa = taksaFor(birth.day);
  const zodiac = chineseZodiac(d);

  return {
    ok: true,
    profile: {
      firstName,
      lastName,
      birthDate: d,
      birthDateTh: formatThaiDate(d),
      birthYearBE: toBE(d.year),
      age: ageOn(d, today),
      birthTime: input.birthTime?.trim() || null,
      numerology: nameNumerology(firstName, lastName),
      birthDay: {
        key: birth.day,
        th: DAY_INFO[birth.day].th,
        number: DAY_INFO[birth.day].number,
        timeUnknown: birth.timeUnknown,
        shiftedBeforeSunrise: birth.shiftedBeforeSunrise,
      },
      taksa: TAKSA_POSITIONS.map((position) => ({ position, day: DAY_INFO[taksa[position]].th })),
      kalakini: { first: kalakiniLetters(firstName, birth.day), last: kalakiniLetters(lastName, birth.day) },
      colors: taksaColors(birth.day),
      chineseZodiac: { th: zodiac.th, animal: zodiac.animal, beforeYearStart: zodiac.beforeYearStart },
      thaiSign: thaiSign(d),
      westernSign: westernSign(d),
      focus: input.focus,
    },
  };
}
