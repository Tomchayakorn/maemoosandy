import { describe, expect, it } from "vitest";
import { daysInMonth, formatThaiDate, parseBirthDate, toBE, toCE } from "./calendar";
import { digitRoot, letterValue, nameNumerology, sumName } from "./numerology";
import { astrologicalBirthDay, kalakiniLetters, parseTime, taksaColors, taksaFor, weekdayOf } from "./taksa";
import { chineseZodiac, thaiSign, westernSign } from "./zodiac";
import { computeBirthProfile } from "./profile";

const TODAY = new Date(2026, 10, 18); // 18 Nov 2026

describe("calendar", () => {
  it("converts between พ.ศ. and ค.ศ.", () => {
    expect(toCE(2533, "BE")).toBe(1990);
    expect(toCE(1990, "CE")).toBe(1990);
    expect(toBE(2026)).toBe(2569);
  });

  it("knows leap years", () => {
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it("accepts real dates in either calendar", () => {
    expect(parseBirthDate({ day: 29, month: 2, year: 2543, calendar: "BE" }, TODAY)).toEqual({
      ok: true,
      date: { year: 2000, month: 2, day: 29 },
    });
    expect(parseBirthDate({ day: 15, month: 5, year: 1990, calendar: "CE" }, TODAY).ok).toBe(true);
  });

  it("rejects impossible, future and mixed-up years", () => {
    expect(parseBirthDate({ day: 30, month: 2, year: 2000, calendar: "CE" }, TODAY).ok).toBe(false);
    expect(parseBirthDate({ day: 29, month: 2, year: 2001, calendar: "CE" }, TODAY).ok).toBe(false);
    expect(parseBirthDate({ day: 1, month: 1, year: 2030, calendar: "CE" }, TODAY).ok).toBe(false);
    expect(parseBirthDate({ day: 1, month: 1, year: 2533, calendar: "CE" }, TODAY).ok).toBe(false); // looks like พ.ศ.
    expect(parseBirthDate({ day: 1, month: 1, year: 1990, calendar: "BE" }, TODAY).ok).toBe(false); // looks like ค.ศ.
    expect(parseBirthDate({ day: 1, month: 13, year: 1990, calendar: "CE" }, TODAY).ok).toBe(false);
  });

  it("formats Thai dates", () => {
    expect(formatThaiDate({ year: 1990, month: 5, day: 15 })).toBe("15 พฤษภาคม พ.ศ. 2533");
  });
});

describe("numerology", () => {
  it("uses the standard Thai letter table", () => {
    expect(letterValue("ก")).toBe(1);
    expect(letterValue("ข")).toBe(2);
    expect(letterValue("ต")).toBe(3);
    expect(letterValue("ร")).toBe(4);
    expect(letterValue("ม")).toBe(5);
    expect(letterValue("อ")).toBe(6);
    expect(letterValue("ส")).toBe(7);
    expect(letterValue("ย")).toBe(8);
    expect(letterValue("ไ")).toBe(9);
    // vowels and tone marks count too
    expect(letterValue("า")).toBe(1);
    expect(letterValue("่")).toBe(1);
    expect(letterValue("้")).toBe(2);
    expect(letterValue("ี")).toBe(7);
    // spaces / digits don't
    expect(letterValue(" ")).toBeNull();
    expect(letterValue("1")).toBeNull();
  });

  it("sums a name letter by letter", () => {
    // ส7 ม5 ช2 า1 ย8 = 23
    expect(sumName("สมชาย").total).toBe(23);
    // ใ6 จ6 ด1 ี7 = 20
    expect(sumName("ใจดี").total).toBe(20);
    // แ2 ม5 ่1 ม5 ู2 แ2 ซ7 น5 ด1 ี7 ้2 = 39
    expect(sumName("แม่มูแซนดี้").total).toBe(39);
  });

  it("handles names typed in English", () => {
    // S3 A1 N5 D4 Y1 = 14
    expect(sumName("Sandy").total).toBe(14);
    expect(sumName("sandy").total).toBe(14);
  });

  it("totals first + last name", () => {
    expect(nameNumerology("สมชาย", "ใจดี")).toEqual({ first: 23, last: 20, total: 43 });
  });

  it("reduces to a single digit", () => {
    expect(digitRoot(43)).toBe(7);
    expect(digitRoot(99)).toBe(9);
    expect(digitRoot(5)).toBe(5);
  });
});

describe("birth day and taksa", () => {
  it("finds the weekday regardless of timezone", () => {
    expect(weekdayOf({ year: 2000, month: 1, day: 1 })).toBe("sat");
    expect(weekdayOf({ year: 2024, month: 1, day: 1 })).toBe("mon");
    expect(weekdayOf({ year: 2026, month: 11, day: 18 })).toBe("wed");
  });

  it("parses birth times", () => {
    expect(parseTime("06:00")).toBe(360);
    expect(parseTime("23:59")).toBe(1439);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("")).toBeNull();
  });

  it("splits Wednesday into day and night (ราหู)", () => {
    const wed = { year: 2026, month: 11, day: 18 };
    expect(astrologicalBirthDay(wed, "10:00").day).toBe("wed");
    expect(astrologicalBirthDay(wed, "18:30").day).toBe("wedNight");
    expect(astrologicalBirthDay(wed).day).toBe("wed");
    expect(astrologicalBirthDay(wed).timeUnknown).toBe(true);
  });

  it("counts births before sunrise as the previous day", () => {
    const thu = { year: 2026, month: 11, day: 19 };
    const r = astrologicalBirthDay(thu, "03:00");
    expect(r.day).toBe("wedNight");
    expect(r.shiftedBeforeSunrise).toBe(true);
    const mon = { year: 2024, month: 1, day: 1 };
    expect(astrologicalBirthDay(mon, "05:59").day).toBe("sun");
    expect(astrologicalBirthDay(mon, "06:00").day).toBe("mon");
  });

  it("builds the ทักษา wheel with the traditional กาลกิณี for every day", () => {
    expect(taksaFor("sun")["กาลกิณี"]).toBe("fri");
    expect(taksaFor("mon")["กาลกิณี"]).toBe("sun");
    expect(taksaFor("tue")["กาลกิณี"]).toBe("mon");
    expect(taksaFor("wed")["กาลกิณี"]).toBe("tue");
    expect(taksaFor("thu")["กาลกิณี"]).toBe("sat");
    expect(taksaFor("fri")["กาลกิณี"]).toBe("wedNight");
    expect(taksaFor("sat")["กาลกิณี"]).toBe("wed");
    expect(taksaFor("wedNight")["กาลกิณี"]).toBe("thu");
    expect(taksaFor("sun")["ศรี"]).toBe("wed");
  });

  it("finds กาลกิณี letters in a name", () => {
    // Born Sunday → กาลกิณี letters ศ ษ ส ห ฬ ฮ
    expect(kalakiniLetters("สมชาย", "sun")).toEqual(["ส"]);
    // Born Monday → กาลกิณี are vowels
    expect(kalakiniLetters("สมชาย", "mon")).toEqual(["า"]);
    expect(kalakiniLetters("กมล", "tue")).toEqual(["ก"]);
  });

  it("derives lucky colours from the wheel", () => {
    expect(taksaColors("sun")).toMatchObject({ birthDay: "แดง", sri: "เขียว", avoid: "ฟ้า" });
  });
});

describe("zodiac", () => {
  it("switches ปีนักษัตร at Songkran", () => {
    expect(chineseZodiac({ year: 2020, month: 5, day: 1 }).th).toBe("ชวด");
    const early = chineseZodiac({ year: 2020, month: 2, day: 1 });
    expect(early.th).toBe("กุน");
    expect(early.beforeYearStart).toBe(true);
    expect(chineseZodiac({ year: 1990, month: 5, day: 15 }).th).toBe("มะเมีย");
    expect(chineseZodiac({ year: 2026, month: 11, day: 18 }).th).toBe("มะเมีย");
  });

  it("gives Thai sidereal and western signs", () => {
    expect(thaiSign({ year: 2000, month: 4, day: 20 })).toBe("ราศีเมษ");
    expect(thaiSign({ year: 2000, month: 3, day: 25 })).toBe("ราศีมีน");
    expect(westernSign({ year: 2000, month: 3, day: 25 })).toBe("ราศีเมษ");
    expect(thaiSign({ year: 2000, month: 1, day: 5 })).toBe("ราศีธนู");
    expect(thaiSign({ year: 2000, month: 12, day: 31 })).toBe("ราศีธนู");
    expect(westernSign({ year: 2000, month: 12, day: 31 })).toBe("ราศีมังกร");
  });
});

describe("profile", () => {
  it("combines everything for the reading", () => {
    const r = computeBirthProfile(
      { firstName: " สมชาย ", lastName: "ใจดี", day: 15, month: 5, year: 2533, calendar: "BE", focus: "career" },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.firstName).toBe("สมชาย");
    expect(r.profile.birthDate).toEqual({ year: 1990, month: 5, day: 15 });
    expect(r.profile.numerology.total).toBe(43);
    expect(r.profile.birthDay.key).toBe("tue");
    expect(r.profile.age).toBe(36);
    expect(r.profile.taksa).toHaveLength(8);
    expect(r.profile.chineseZodiac.th).toBe("มะเมีย");
  });

  it("passes date errors through", () => {
    const r = computeBirthProfile(
      { firstName: "ก", lastName: "ข", day: 31, month: 4, year: 1990, calendar: "CE", focus: "overall" },
      TODAY,
    );
    expect(r.ok).toBe(false);
  });
});
