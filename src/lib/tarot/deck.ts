/**
 * Rider–Waite–Smith 78-card structure with Thai names and short keyword meanings.
 * Shared by server (drawing, prompt) and client (card faces). Drawing lives in draw.ts.
 */

export type Suit = "wands" | "cups" | "swords" | "pentacles";

export type TarotCardDef = {
  id: string;
  nameEn: string;
  nameTh: string;
  arcana: "major" | "minor";
  number: number; // major 0–21, minor 1–14 (11 Page, 12 Knight, 13 Queen, 14 King)
  suit?: Suit;
  upright: string;
  reversed: string;
};

export const POSITIONS = ["อดีต", "ปัจจุบัน", "อนาคต"] as const;
export type Position = (typeof POSITIONS)[number];

/** A card as drawn for a reading: orientation + position + the meaning that applies. */
export type DrawnCardView = Omit<TarotCardDef, "reversed"> & {
  isReversed: boolean;
  position: Position;
  meaning: string;
};

const MAJORS: Array<[string, string, string, string]> = [
  ["The Fool", "คนโง่ (The Fool)", "การเริ่มต้นใหม่ ความกล้า อิสระ ศรัทธาในโชค", "ความประมาท ตัดสินใจหุนหันพลันแล่น ลังเลไม่กล้าก้าว"],
  ["The Magician", "นักมายากล (The Magician)", "พลังสร้างสรรค์ ความสามารถครบ ลงมือทำให้เป็นจริง", "ใช้ความสามารถผิดทาง หลอกลวง ขาดความมั่นใจ"],
  ["The High Priestess", "สตรีนักบวช (The High Priestess)", "สัญชาตญาณ ความลับ ปัญญาภายใน การรอคอยอย่างสงบ", "ความลับถูกปิดบัง ไม่ฟังเสียงใจตัวเอง ข้อมูลไม่ครบ"],
  ["The Empress", "จักรพรรดินี (The Empress)", "ความอุดมสมบูรณ์ ความรัก ความงาม การดูแลเอาใจใส่", "พึ่งพาผู้อื่นเกินไป ละเลยตนเอง ความคิดสร้างสรรค์ติดขัด"],
  ["The Emperor", "จักรพรรดิ (The Emperor)", "อำนาจ ความมั่นคง ระเบียบวินัย ผู้นำ", "เผด็จการ ดื้อรั้น ขาดการควบคุม"],
  ["The Hierophant", "พระสังฆราช (The Hierophant)", "ประเพณี ครูบาอาจารย์ การเรียนรู้ ความเชื่อ", "แหกกฎ ตั้งคำถามกับขนบเดิม ความเชื่อขัดแย้ง"],
  ["The Lovers", "คู่รัก (The Lovers)", "ความรัก ความสัมพันธ์ การเลือกด้วยหัวใจ ความกลมเกลียว", "ความไม่ลงรอย การเลือกผิด ความสัมพันธ์ไม่สมดุล"],
  ["The Chariot", "รถศึก (The Chariot)", "ชัยชนะ ความมุ่งมั่น ควบคุมทิศทางได้ เดินหน้า", "ขาดทิศทาง ความพ่ายแพ้ชั่วคราว ใจร้อน"],
  ["Strength", "พลัง (Strength)", "ความเข้มแข็งภายใน ความอดทน ความเมตตาที่ชนะทุกสิ่ง", "ความไม่มั่นใจ อารมณ์ครอบงำ หมดแรงใจ"],
  ["The Hermit", "ฤๅษี (The Hermit)", "การใคร่ครวญ แสวงหาความจริง ปัญญาจากความสงบ", "ความโดดเดี่ยว ปลีกตัวมากเกินไป หลงทาง"],
  ["Wheel of Fortune", "กงล้อแห่งโชคชะตา (Wheel of Fortune)", "จุดเปลี่ยน โชคชะตาหมุนเวียน โอกาสใหม่", "โชคไม่เข้าข้างชั่วคราว ต่อต้านการเปลี่ยนแปลง"],
  ["Justice", "ความยุติธรรม (Justice)", "ความยุติธรรม เหตุและผล การตัดสินใจที่ถูกต้อง", "ความไม่ยุติธรรม หลีกเลี่ยงความรับผิดชอบ"],
  ["The Hanged Man", "คนถูกแขวน (The Hanged Man)", "การรอคอย มองมุมใหม่ เสียสละเพื่อสิ่งที่ดีกว่า", "ติดอยู่กับที่ เสียสละโดยเปล่าประโยชน์ ลังเล"],
  ["Death", "ความเปลี่ยนแปลง (Death)", "การสิ้นสุดเพื่อเริ่มใหม่ การเปลี่ยนผ่านครั้งใหญ่ ปล่อยวาง", "ยึดติดกับอดีต กลัวการเปลี่ยนแปลง"],
  ["Temperance", "ความพอดี (Temperance)", "ความสมดุล ความพอดี การประสานสิ่งต่างๆ ความอดทน", "ความไม่สมดุล ทำอะไรเกินพอดี ใจร้อน"],
  ["The Devil", "ปีศาจ (The Devil)", "พันธนาการ กิเลส สิ่งเสพติด ความหลงใหล", "การหลุดพ้น ปลดโซ่ตรวน กลับมาควบคุมตัวเองได้"],
  ["The Tower", "หอคอย (The Tower)", "การเปลี่ยนแปลงฉับพลัน ความจริงถูกเปิดเผย สร้างใหม่บนรากฐานที่ดีกว่า", "หลีกเลี่ยงวิกฤต ความกลัวการเปลี่ยนแปลง"],
  ["The Star", "ดวงดาว (The Star)", "ความหวัง แรงบันดาลใจ การเยียวยา ศรัทธา", "หมดหวังชั่วคราว ขาดแรงบันดาลใจ"],
  ["The Moon", "ดวงจันทร์ (The Moon)", "ความไม่ชัดเจน สัญชาตญาณ ความกังวล สิ่งที่ซ่อนอยู่", "ความจริงกระจ่าง ความกลัวคลี่คลาย"],
  ["The Sun", "ดวงอาทิตย์ (The Sun)", "ความสำเร็จ ความสุข ความสดใส พลังบวก", "ความสุขที่ล่าช้า มองโลกในแง่ดีเกินไป"],
  ["Judgement", "การพิพากษา (Judgement)", "การตื่นรู้ โอกาสครั้งที่สอง การประเมินตนเอง", "ไม่ยอมรับบทเรียน ตัดสินตัวเองรุนแรงเกินไป"],
  ["The World", "โลก (The World)", "ความสำเร็จสมบูรณ์ การบรรลุเป้าหมาย การเดินทาง", "งานยังไม่จบ ขาดอีกเพียงนิดเดียว"],
];

const SUITS: Record<Suit, { th: string; en: string; theme: string }> = {
  wands: { th: "ไม้เท้า", en: "Wands", theme: "การงาน ความมุ่งมั่น พลังสร้างสรรค์" },
  cups: { th: "ถ้วย", en: "Cups", theme: "ความรัก อารมณ์ ความสัมพันธ์" },
  swords: { th: "ดาบ", en: "Swords", theme: "ความคิด การตัดสินใจ อุปสรรค" },
  pentacles: { th: "เหรียญ", en: "Pentacles", theme: "การเงิน ทรัพย์สิน ความมั่นคง" },
};

const RANKS: Array<[string, string, string, string]> = [
  ["Ace", "เอซ", "จุดเริ่มต้นใหม่ โอกาสใหม่", "โอกาสหลุดมือ เริ่มต้นช้า"],
  ["Two", "สอง", "การเลือก ความร่วมมือ ความสมดุล", "ความลังเล ความไม่สมดุล"],
  ["Three", "สาม", "การเติบโต ความร่วมมือ ผลแรกเริ่ม", "ความล่าช้า ทีมไม่ลงรอย"],
  ["Four", "สี่", "ความมั่นคง การพักฟื้น รากฐาน", "ความเฉื่อย ยึดติด"],
  ["Five", "ห้า", "ความท้าทาย ความขัดแย้ง การสูญเสียชั่วคราว", "การฟื้นตัว ผ่านพ้นความขัดแย้ง"],
  ["Six", "หก", "การฟื้นฟู ความช่วยเหลือ ความก้าวหน้า", "ติดอยู่กับอดีต ความช่วยเหลือที่ไม่สมดุล"],
  ["Seven", "เจ็ด", "การประเมิน ความอดทน ยืนหยัด", "ความสับสน หมดความอดทน"],
  ["Eight", "แปด", "ความเคลื่อนไหว ความชำนาญ การเปลี่ยนแปลง", "ติดขัด วนอยู่ที่เดิม"],
  ["Nine", "เก้า", "ใกล้ความสำเร็จ ความพึงพอใจ", "ความกังวล ความพอใจที่ยังไม่เต็ม"],
  ["Ten", "สิบ", "ความสมบูรณ์ จุดสูงสุดของวงจร", "ภาระหนัก วงจรที่ต้องปิด"],
  ["Page", "มหาดเล็ก", "ข่าวสาร การเรียนรู้ ความอยากรู้", "ข่าวล่าช้า ความไม่พร้อม"],
  ["Knight", "อัศวิน", "การลงมือ การเดินทาง ความกระตือรือร้น", "ใจร้อน ขาดทิศทาง"],
  ["Queen", "ราชินี", "ความเข้าใจ ความเมตตา ความเป็นผู้ใหญ่", "อารมณ์อ่อนไหว พึ่งพิงผู้อื่น"],
  ["King", "ราชา", "ความเป็นผู้นำ การควบคุม ความสำเร็จ", "ใช้อำนาจผิด ดื้อรั้น"],
];

export const DECK: TarotCardDef[] = [
  ...MAJORS.map(([nameEn, nameTh, upright, reversed], i) => ({
    id: `major-${String(i).padStart(2, "0")}`,
    nameEn,
    nameTh,
    arcana: "major" as const,
    number: i,
    upright,
    reversed,
  })),
  ...(Object.keys(SUITS) as Suit[]).flatMap((suit) =>
    RANKS.map(([rankEn, rankTh, up, rev], i) => ({
      id: `${suit}-${String(i + 1).padStart(2, "0")}`,
      nameEn: `${rankEn} of ${SUITS[suit].en}`,
      nameTh: `${rankTh}${SUITS[suit].th} (${rankEn} of ${SUITS[suit].en})`,
      arcana: "minor" as const,
      number: i + 1,
      suit,
      upright: `${up} — ด้าน${SUITS[suit].theme}`,
      reversed: `${rev} — ด้าน${SUITS[suit].theme}`,
    })),
  ),
];

export const SUIT_LABEL_TH: Record<Suit, string> = {
  wands: SUITS.wands.th,
  cups: SUITS.cups.th,
  swords: SUITS.swords.th,
  pentacles: SUITS.pentacles.th,
};

const ROMAN = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
];
const MINOR_RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "P", "Kn", "Q", "K"];

/** Corner label for a card face: roman numeral for majors, rank for minors. */
export function cardCornerLabel(card: Pick<TarotCardDef, "arcana" | "number">): string {
  return card.arcana === "major" ? ROMAN[card.number] : MINOR_RANK_LABEL[card.number];
}

/** Successful body of POST /api/fortune/tarot. */
export type TarotResponse = {
  cards: DrawnCardView[];
  reading: string;
  balance: number;
  freeReadingTickets: number;
  usedFreeTicket: boolean;
  /** the Thai date and time (server clock) the cards were read for, e.g. "วันศุกร์ที่ 27 พฤศจิกายน พ.ศ. 2569 เวลา 14:05 น. (ช่วงบ่าย)" */
  asOf?: string;
};

/** Short Thai name without the English part in parentheses. */
export function shortThaiName(nameTh: string): string {
  return nameTh.replace(/\s*\(.*\)\s*$/, "");
}
