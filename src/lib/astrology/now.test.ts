import { describe, expect, it } from "vitest";
import { ageOn, parseBirthDate } from "./calendar";
import { dayPartOf, thaiNow, todayRelation } from "./now-th";
import { buildBirthdatePrompt } from "./prompt";
import { computeBirthProfile } from "./profile";
import { LENSES, OPENINGS, pickVariety } from "./variety";

// 2026-11-25 is a Wednesday, so 27 = Friday and 28 = Saturday.
const FRI_1405 = new Date("2026-11-27T07:05:00Z"); // 14:05 in Bangkok

describe("thaiNow", () => {
  it("reads the Thai date, time and day part from the instant", () => {
    const n = thaiNow(FRI_1405);
    expect(n).toMatchObject({ isoDate: "2026-11-27", weekdayTh: "ศุกร์", day: 27, monthTh: "พฤศจิกายน", yearBE: 2569, hhmm: "14:05", dayPart: "บ่าย", astroDay: "fri" });
    expect(n.label).toBe("วันศุกร์ที่ 27 พฤศจิกายน พ.ศ. 2569 เวลา 14:05 น. (ช่วงบ่าย)");
  });
  it("crosses the UTC midnight: 18:30Z is already tomorrow in Bangkok", () => {
    const n = thaiNow(new Date("2026-11-26T18:30:00Z")); // Fri 27 Nov 01:30 in Bangkok
    expect(n.isoDate).toBe("2026-11-27");
    expect(n.weekdayTh).toBe("ศุกร์");
    expect(n.astroDay).toBe("thu"); // before 06:00 the astrological day is still Thursday
  });
  it("the astrological day changes at 06:00 Bangkok time", () => {
    expect(thaiNow(new Date("2026-11-26T22:59:00Z")).astroDay).toBe("thu"); // Fri 05:59
    expect(thaiNow(new Date("2026-11-26T23:00:00Z")).astroDay).toBe("fri"); // Fri 06:00
  });
  it("Wednesday night (from 18:00, and until 06:00 Thursday) is ราหู", () => {
    expect(thaiNow(new Date("2026-11-25T10:59:00Z")).astroDay).toBe("wed"); // 17:59
    expect(thaiNow(new Date("2026-11-25T11:00:00Z")).astroDay).toBe("wedNight"); // 18:00
    expect(thaiNow(new Date("2026-11-25T18:00:00Z")).astroDay).toBe("wedNight"); // Thu 01:00
    expect(thaiNow(new Date("2026-11-25T23:00:00Z")).astroDay).toBe("thu"); // Thu 06:00
  });
  it("day parts", () => {
    expect([0, 3, 4, 5, 6, 10, 11, 12, 13, 15, 16, 17, 18, 20, 21, 23].map(dayPartOf)).toEqual(
      ["ดึก", "ดึก", "ใกล้รุ่ง", "ใกล้รุ่ง", "เช้า", "เช้า", "เที่ยง", "เที่ยง", "บ่าย", "บ่าย", "เย็น", "เย็น", "ค่ำ", "ค่ำ", "ดึก", "ดึก"],
    );
  });
});

describe("todayRelation (Thursday-born: เดช is Friday, กาลกิณี is Saturday)", () => {
  const profile = (() => {
    const r = computeBirthProfile({ firstName: "สมชาย", lastName: "ใจดี", day: 4, month: 1, year: 1990, calendar: "CE", birthTime: null, focus: "overall" }, FRI_1405);
    if (!r.ok) throw new Error(r.error);
    return r.profile;
  })();
  it("finds where today sits on the wheel", () => {
    expect(profile.birthDay.key).toBe("thu");
    const fri = todayRelation(profile.taksa, profile.birthDay.key, thaiNow(FRI_1405));
    expect(fri).toMatchObject({ position: "เดช", tone: "favourable", isBirthDay: false });
    const sat = todayRelation(profile.taksa, profile.birthDay.key, thaiNow(new Date("2026-11-28T03:00:00Z")));
    expect(sat).toMatchObject({ position: "กาลกิณี", tone: "caution" });
    const thu = todayRelation(profile.taksa, profile.birthDay.key, thaiNow(new Date("2026-11-26T05:00:00Z")));
    expect(thu).toMatchObject({ position: "บริวาร", isBirthDay: true });
  });

  describe("the prompt", () => {
    const variety = pickVariety(() => 1);
    it("carries the current Thai time, today's position and the new sections", () => {
      const p = buildBirthdatePrompt(profile, { now: FRI_1405, variety });
      expect(p).toContain("วันศุกร์ที่ 27 พฤศจิกายน พ.ศ. 2569 เวลา 14:05 น. (ช่วงบ่าย)");
      expect(p).toContain('ตำแหน่ง "เดช"');
      expect(p).toContain(variety.opening);
      expect(p).toContain(variety.lens);
      for (const h of ["## ดวงวันศุกร์นี้ ช่วงบ่าย", "## อะไรเด่นช่วงนี้", "## อะไรดับหรือควรระวังช่วงนี้", "## คำแนะนำเสริมดวงจากแม่มู"]) expect(p).toContain(h);
      expect(p).toContain("ห้ามอ้างวันพระ");
    });
    it("is different at a different moment, and has no variety block when none is given", () => {
      const a = buildBirthdatePrompt(profile, { now: FRI_1405 });
      const b = buildBirthdatePrompt(profile, { now: new Date("2026-11-28T03:00:00Z") });
      expect(a).not.toBe(b);
      expect(b).toContain('ตำแหน่ง "กาลกิณี"');
      expect(a).not.toContain("มุมเล่าครั้งนี้");
    });
    it("congratulates on the birthday (day and month) in Thailand time", () => {
      const r = computeBirthProfile({ firstName: "สมหญิง", lastName: "ใจดี", day: 27, month: 11, year: 1990, calendar: "CE", birthTime: null, focus: "love" }, FRI_1405);
      if (!r.ok) throw new Error(r.error);
      expect(buildBirthdatePrompt(r.profile, { now: FRI_1405 })).toContain("วันเกิด (วัน/เดือน)");
      expect(buildBirthdatePrompt(profile, { now: FRI_1405 })).not.toContain("วันเกิด (วัน/เดือน)");
    });
  });
});

describe("variety", () => {
  it("picks from the lists with the supplied random source", () => {
    expect(pickVariety(() => 0)).toEqual({ opening: OPENINGS[0], lens: LENSES[0] });
    expect(pickVariety((n) => n - 1)).toEqual({ opening: OPENINGS[OPENINGS.length - 1], lens: LENSES[LENSES.length - 1] });
  });
});

describe("dates are read in Thailand time, not the server's", () => {
  it("age: the birthday has already arrived in Bangkok while a UTC server still sees yesterday", () => {
    const justAfterMidnightBkk = new Date("2026-11-27T20:00:00Z"); // 28 Nov 03:00 in Bangkok, 27 Nov in UTC
    expect(ageOn({ year: 1990, month: 11, day: 28 }, justAfterMidnightBkk)).toBe(36);
    expect(ageOn({ year: 1990, month: 11, day: 28 }, FRI_1405)).toBe(35);
  });
  it("a birth date of 'today in Thailand' is not 'in the future'", () => {
    const input = { day: 28, month: 11, year: 2026, calendar: "CE" as const };
    expect(parseBirthDate(input, new Date("2026-11-27T20:00:00Z")).ok).toBe(true);
    expect(parseBirthDate(input, new Date("2026-11-27T10:00:00Z")).ok).toBe(false);
  });
});
