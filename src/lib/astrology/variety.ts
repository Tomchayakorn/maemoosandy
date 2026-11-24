/**
 * Per-reading variety for the AI. Claude Opus with thinking on does not take a sampling temperature, so each request carries a small
 * server-picked "angle" instead: a way to open and a lens to tell the day through. The structure of the reading never changes.
 * Pure: the caller supplies the random source (crypto on the server).
 */
export const OPENINGS = [
  "เริ่มด้วยภาพเปรียบเทียบจากธรรมชาติหรือสายลมฟ้าอากาศของช่วงเวลานี้",
  "เริ่มด้วยคำถามสั้นๆ ที่ชวนให้ผู้ถามหยุดคิดถึงตัวเอง",
  "เริ่มจากสิ่งที่ทำให้วันนี้พิเศษกว่าวันอื่นสำหรับเขาคนนี้",
  "เริ่มด้วยคำอวยพรอบอุ่นแบบพี่สาวทักน้อง แล้วค่อยเข้าเรื่อง",
  "เริ่มด้วยการสังเกตเล็กๆ จากชื่อหรือวันเกิดที่แม่มูสะดุดตา",
  "เริ่มด้วยประโยคสั้น ตรงๆ สรุปพลังของวันนี้ในหนึ่งบรรทัด",
] as const;

export const LENSES = [
  "เล่าผ่านเรื่องงานและการเงินในชีวิตประจำวัน",
  "เล่าผ่านความสัมพันธ์กับคนใกล้ตัว",
  "เล่าผ่านสภาพใจและพลังงานของร่างกาย",
  "เล่าผ่านจังหวะของวัน ตั้งแต่ตอนนี้จนถึงค่ำ",
  "เล่าผ่านการตัดสินใจเล็กๆ ที่ต้องเจอวันนี้",
  "เล่าผ่านโอกาสที่มักมาโดยไม่ทันตั้งตัว",
] as const;

export type Variety = { opening: string; lens: string };

export function pickVariety(rand: (maxExclusive: number) => number): Variety {
  return { opening: OPENINGS[rand(OPENINGS.length)], lens: LENSES[rand(LENSES.length)] };
}
