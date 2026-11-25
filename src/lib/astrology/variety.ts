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

/** The same idea for the 3-card tarot reading (no birth chart there, so the angles are about the cards and the moment). */
export const TAROT_OPENINGS = [
  "เริ่มด้วยภาพเปรียบเทียบจากไพ่ใบที่สะดุดตาที่สุดในสามใบ",
  "เริ่มด้วยการทักทายอบอุ่น แล้วเชื่อมกับบรรยากาศของวันและเวลานี้",
  "เริ่มด้วยคำถามสั้นๆ ที่ชวนผู้ถามหยุดคิดถึงใจตัวเอง",
  "เริ่มด้วยประโยคสั้น ตรงๆ สรุปพลังของไพ่ทั้งสามในหนึ่งบรรทัด",
  "เริ่มด้วยการเล่าสั้นๆ เหมือนไพ่กำลังเล่าเรื่องให้ฟัง",
  "เริ่มด้วยคำปลอบหรือคำอวยพรแบบพี่สาวที่รู้ใจ",
] as const;

export const TAROT_LENSES = [
  "เล่าโดยเน้นจังหวะของวัน ตั้งแต่ตอนนี้จนถึงค่ำ",
  "เล่าโดยเน้นสิ่งที่ผู้ถามคุมได้ในมือตัวเอง",
  "เล่าโดยเน้นผู้คนรอบตัวที่เกี่ยวกับคำถาม",
  "เล่าโดยเน้นโอกาสเล็กๆ ที่มักถูกมองข้าม",
  "เล่าโดยเน้นความรู้สึกในใจกับสิ่งที่ควรลงมือทำ",
  "เล่าโดยเน้นการเปลี่ยนผ่านจากอดีตสู่อนาคตเป็นขั้นตอน",
] as const;

export function pickTarotVariety(rand: (maxExclusive: number) => number): Variety {
  return { opening: TAROT_OPENINGS[rand(TAROT_OPENINGS.length)], lens: TAROT_LENSES[rand(TAROT_LENSES.length)] };
}
