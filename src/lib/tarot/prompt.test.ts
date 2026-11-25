import { describe, expect, it } from "vitest";
import { pickTarotVariety, TAROT_LENSES, TAROT_OPENINGS } from "../astrology/variety";
import { DECK, POSITIONS, shortThaiName, type DrawnCardView } from "./deck";
import { buildTarotPrompt } from "./prompt";

const FRI_1405 = new Date("2026-11-27T07:05:00Z"); // Friday 14:05 in Bangkok

function drawn(indexes: [number, number, number], reversed: [boolean, boolean, boolean]): DrawnCardView[] {
  return POSITIONS.map((position, i) => {
    const { reversed: rev, ...card } = DECK[indexes[i]];
    return { ...card, isReversed: reversed[i], position, meaning: reversed[i] ? rev : card.upright };
  });
}
const cards = drawn([0, 16, 19], [false, true, false]);

describe("buildTarotPrompt", () => {
  const prompt = buildTarotPrompt("งานใหม่จะราบรื่นไหมคะ", cards, { now: FRI_1405, variety: pickTarotVariety(() => 1) });

  it("keeps the three positions and the cards exactly as drawn", () => {
    cards.forEach((c, i) => {
      expect(prompt).toContain(`${i + 1}. ตำแหน่ง "${POSITIONS[i]}": ${c.nameTh}${c.isReversed ? " — ไพ่กลับหัว" : " — ไพ่หัวตั้ง"}`);
      expect(prompt).toContain(`ความหมายหลัก: ${c.meaning}`);
    });
    expect(prompt).toContain(`## อดีต: ${shortThaiName(cards[0].nameTh)}`);
    expect(prompt).toContain(`## ปัจจุบัน: ${shortThaiName(cards[1].nameTh)}`);
    expect(prompt).toContain(`## อนาคต: ${shortThaiName(cards[2].nameTh)}`);
    expect(prompt).toContain("<question>งานใหม่จะราบรื่นไหมคะ</question>");
  });

  it("carries the current Thai date and time", () => {
    expect(prompt).toContain("วันศุกร์ที่ 27 พฤศจิกายน พ.ศ. 2569 เวลา 14:05 น. (ช่วงบ่าย)");
    expect(prompt).toContain("สีประจำวันนี้");
    expect(prompt).toContain("ดูตอนนี้คือศุกร์ ช่วงบ่าย");
  });

  it("has the sections in order, ending with the closing advice", () => {
    const heads = [
      "## ภาพรวมของคำถาม", "## อดีต:", "## ปัจจุบัน:", "## อนาคต:", "## จังหวะเวลานี้กับไพ่ทั้งสามใบ",
      "## สิ่งที่ควรทำในจังหวะนี้", "## สิ่งที่ควรหลบหลีกหรือระวังในจังหวะนี้", "## คำตอบจากแม่มู", "## คำแนะนำเสริมดวงจากแม่มู",
    ].map((h) => prompt.indexOf(h));
    expect(heads.every((i) => i >= 0)).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
  });

  it("tells the AI how to tune the prayer advice to the cards, softly", () => {
    expect(prompt).toContain("การสวดเสริมดวงชะตากับแม่มูแซนดี้");
    expect(prompt).toContain("ปัดเป่าอุปสรรค ผ่อนหนักให้เป็นเบา และเปิดทางให้ราบรื่นขึ้น"); // for a heavy reading
    expect(prompt).toContain("หนุนดวงให้ดียิ่งขึ้นไปอีก ต่อยอดความสำเร็จ และรักษาพลังบวกให้ต่อเนื่อง"); // for a good reading
    expect(prompt).toContain("ยึดทิศทางของใบปัจจุบันและใบอนาคตเป็นหลัก"); // mixed
    for (const guard of ["ห้ามกดดัน", "ห้ามเร่งรัด", "ห้ามรับประกันผลลัพธ์", "ห้ามระบุราคา ช่องทาง หรือเงื่อนไข"]) expect(prompt).toContain(guard);
    expect(prompt).toContain("ห้ามอ้างวันพระ");
  });

  it("changes with the moment and carries the variety angle only when given", () => {
    const later = buildTarotPrompt("งานใหม่จะราบรื่นไหมคะ", cards, { now: new Date("2026-11-28T03:00:00Z") });
    expect(later).not.toBe(buildTarotPrompt("งานใหม่จะราบรื่นไหมคะ", cards, { now: FRI_1405 }));
    expect(later).toContain("วันเสาร์ที่ 28 พฤศจิกายน");
    expect(later).not.toContain("มุมเล่าครั้งนี้");
    expect(prompt).toContain(TAROT_OPENINGS[1]);
    expect(prompt).toContain(TAROT_LENSES[1]);
  });
});
