/**
 * คลังข้อความเกม "ดวงดี มีเฮ" — 108 ข้อความ (funny 36 · encourage 36 · luck 36).
 * Pure data, safe for client and server. Which message a player gets must be picked on the SERVER
 * (crypto) — the client only displays what the API returns.
 */

export type LuckyCardCategory = "funny" | "encourage" | "luck";

export type LuckyCardMessage = {
  /** Stable id, e.g. "funny-01". The API returns the id; the UI looks the text up. */
  id: string;
  category: LuckyCardCategory;
  text: string;
};

export const LUCKY_CARD_CATEGORY_LABEL: Record<LuckyCardCategory, string> = {
  funny: "ฮาๆ ขำๆ",
  encourage: "ให้กำลังใจ",
  luck: "โชคลาภ",
};

export const LUCKY_CARD_MESSAGES: readonly LuckyCardMessage[] = [
  { id: "funny-01", category: "funny", text: "วันนี้เงินอาจหายไปกับกาแฟ แต่โชคจะมาแทนที่นะ" },
  { id: "funny-02", category: "funny", text: "ดวงดีจนแมวยังอยากมานั่งตัก" },
  { id: "funny-03", category: "funny", text: "ระวังโชคลอยมาชน อย่าเดินก้มหน้าดูมือถือ" },
  { id: "funny-04", category: "funny", text: "เงินจะเข้า แต่ต้องเลิกซื้อของที่ไม่จำเป็นก่อนนะ" },
  { id: "funny-05", category: "funny", text: "วันนี้ใครทักว่าอ้วน แปลว่าเขาเห็นบารมีหนา" },
  { id: "funny-06", category: "funny", text: "โชคกำลังเดินทางมา แต่ติดไฟแดงอยู่" },
  { id: "funny-07", category: "funny", text: "ดวงเฮงขนาดนี้ ซื้อกล้วยแขกก็ได้ถูกตัวใหญ่" },
  { id: "funny-08", category: "funny", text: "เทพเจ้าฝากบอกว่า อย่าลืมกินข้าวก่อนรวย" },
  { id: "funny-09", category: "funny", text: "วันนี้พูดอะไรก็มีคนเชื่อ ใช้พลังนี้ให้ดีนะ" },
  { id: "funny-10", category: "funny", text: "เศรษฐีรอคุณอยู่ แต่ขอไปห้องน้ำแป๊บ" },
  { id: "funny-11", category: "funny", text: "ดวงการเงินพุ่งเหมือนราคาหมูตอนแพง" },
  { id: "funny-12", category: "funny", text: "ถ้าวันนี้ไม่ได้โชค แปลว่าเก็บไว้ให้พรุ่งนี้ทีเดียว" },
  { id: "funny-13", category: "funny", text: "อย่าลืมยิ้ม โชคชอบคนหน้าบานมากกว่าหน้างอ" },
  { id: "funny-14", category: "funny", text: "ดวงนี้ซื้อลอตเตอรี่ไม่รู้ แต่ซื้อข้าวแกงได้แน่" },
  { id: "funny-15", category: "funny", text: "เจ้าที่เจ้าทางส่งยิ้มมาให้ รับด้วยนะ" },
  { id: "funny-16", category: "funny", text: "วันนี้ห้ามบ่น เดี๋ยวโชคหนีไปเข้าบ้านเพื่อนบ้าน" },
  { id: "funny-17", category: "funny", text: "เงินทองไหลมา ขอแค่อย่าไหลออกเร็วกว่าเข้า" },
  { id: "funny-18", category: "funny", text: "คนดวงดีแบบคุณ ต้องแบ่งโชคให้เพื่อนบ้าง" },
  { id: "funny-19", category: "funny", text: "โชคลาภกำลังโหลด 99% อีกนิดเดียว" },
  { id: "funny-20", category: "funny", text: "ดวงดีวันนี้ ต้องมีเรื่องให้ดีใจแน่ๆ ไม่มากก็น้อย" },
  { id: "funny-21", category: "funny", text: "แม่มูเห็นเงินลอยมาตรงหน้า อย่าเพิ่งกระพริบตา" },
  { id: "funny-22", category: "funny", text: "วันนี้เหมาะกับการเริ่มต้นสิ่งใหม่ แม้จะแค่เริ่มลดน้ำตาลก็ตาม" },
  { id: "funny-23", category: "funny", text: "ดวงเปล่งประกายจนกล้องหน้าไม่ต้องใช้ฟิลเตอร์" },
  { id: "funny-24", category: "funny", text: "เศษเหรียญใต้โซฟาคือสัญญาณโชคดีของวันนี้" },
  { id: "funny-25", category: "funny", text: "อย่าเพิ่งท้อ ถั่วงอกยังต้องรอสามวันถึงจะงอก" },
  { id: "funny-26", category: "funny", text: "ดวงดีเหมือนไวไฟบ้าน ต้องอยู่ใกล้ถึงจะรับสัญญาณ" },
  { id: "funny-27", category: "funny", text: "วันนี้ใครเลี้ยงข้าว นั่นแหละโชคของคุณ" },
  { id: "funny-28", category: "funny", text: "ยิ้มสู้ไว้ ราคาทองไม่ลงตลอดไปหรอก" },
  { id: "funny-29", category: "funny", text: "ดวงชะตาส่งข้อความมาว่า ตอบแชทเจ้านายด้วย" },
  { id: "funny-30", category: "funny", text: "โชคร้ายเมื่อวานหมดอายุแล้ว วันนี้ต่ออายุเป็นโชคดี" },
  { id: "funny-31", category: "funny", text: "ถ้าเจอฝนตก นั่นคือฟ้าส่งเงินมาล้างโชคร้าย" },
  { id: "funny-32", category: "funny", text: "วันนี้ห้ามเศร้า เพราะโชคกำลังแอบดูอยู่" },
  { id: "funny-33", category: "funny", text: "เหรียญนี้ซื้อความสนุก แถมความหวังฟรี" },
  { id: "funny-34", category: "funny", text: "ไพ่ใบนี้เซ็นรับรองว่าคุณน่ารักที่สุดในห้อง" },
  { id: "funny-35", category: "funny", text: "ดวงดีต้องฉลอง แต่ฉลองแบบประหยัดนะ" },
  { id: "funny-36", category: "funny", text: "วันนี้โชคดีจนต้องระวังไม่ให้ยิ้มเกินไป เดี๋ยวกรามค้าง" },
  { id: "encourage-01", category: "encourage", text: "ทุกความพยายามของคุณกำลังออกดอกผล รออีกนิดนะ" },
  { id: "encourage-02", category: "encourage", text: "คุณเก่งกว่าที่คิด และดีพอแล้วในวันนี้" },
  { id: "encourage-03", category: "encourage", text: "วันที่หนักที่สุดมักอยู่ก่อนวันที่สว่างที่สุด" },
  { id: "encourage-04", category: "encourage", text: "ก้าวเล็กๆ ที่ไม่หยุด พาไปไกลกว่าที่ฝัน" },
  { id: "encourage-05", category: "encourage", text: "เชื่อมั่นในตัวเอง แล้วจักรวาลจะช่วยเอง" },
  { id: "encourage-06", category: "encourage", text: "สิ่งดีๆ กำลังเดินทางมาหาคุณ" },
  { id: "encourage-07", category: "encourage", text: "วันนี้พักได้ แต่อย่าล้มเลิกความฝัน" },
  { id: "encourage-08", category: "encourage", text: "คนที่ไม่ยอมแพ้ ไม่เคยแพ้จริงๆ" },
  { id: "encourage-09", category: "encourage", text: "ใจดีกับตัวเองบ้าง คุณทำดีที่สุดแล้ว" },
  { id: "encourage-10", category: "encourage", text: "ความสำเร็จเริ่มจากการตัดสินใจเริ่ม" },
  { id: "encourage-11", category: "encourage", text: "ทุกปัญหามีทางออก แค่ยังมองไม่เห็นตอนนี้" },
  { id: "encourage-12", category: "encourage", text: "คุณคือแสงสว่างของใครบางคนโดยที่ไม่รู้ตัว" },
  { id: "encourage-13", category: "encourage", text: "อดทนอีกหน่อย ฤดูกาลของคุณกำลังมา" },
  { id: "encourage-14", category: "encourage", text: "ความผิดพลาดคือครูที่ดีที่สุด" },
  { id: "encourage-15", category: "encourage", text: "วันนี้คุณมีค่ามากกว่าเมื่อวาน" },
  { id: "encourage-16", category: "encourage", text: "จงภูมิใจในทุกก้าวที่เดินมาได้ไกลขนาดนี้" },
  { id: "encourage-17", category: "encourage", text: "หัวใจที่เข้มแข็งสร้างปาฏิหาริย์ได้เสมอ" },
  { id: "encourage-18", category: "encourage", text: "สิ่งที่คุณหว่านไว้ กำลังจะเติบโต" },
  { id: "encourage-19", category: "encourage", text: "อย่าเปรียบเทียบกับใคร จังหวะของคุณคือที่สุด" },
  { id: "encourage-20", category: "encourage", text: "พรุ่งนี้เป็นโอกาสใหม่ที่รอคุณอยู่" },
  { id: "encourage-21", category: "encourage", text: "เมตตาที่ให้ผู้อื่น จะย้อนกลับมาหาคุณเสมอ" },
  { id: "encourage-22", category: "encourage", text: "ความฝันของคุณไม่ใหญ่เกินไป" },
  { id: "encourage-23", category: "encourage", text: "ลมหายใจนี้คือของขวัญ ใช้มันให้คุ้มค่า" },
  { id: "encourage-24", category: "encourage", text: "คนดีย่อมมีที่ยืน ขอให้ใจมั่นคง" },
  { id: "encourage-25", category: "encourage", text: "แม้เส้นทางจะคด แต่ปลายทางสวยงาม" },
  { id: "encourage-26", category: "encourage", text: "พลังบวกของคุณดึงดูดสิ่งดีๆ เข้ามา" },
  { id: "encourage-27", category: "encourage", text: "ล้มได้ ลุกได้ ไปต่อได้เสมอ" },
  { id: "encourage-28", category: "encourage", text: "วันนี้ขอบคุณตัวเองที่ไม่ยอมแพ้" },
  { id: "encourage-29", category: "encourage", text: "ความหวังคือพลังที่ยิ่งใหญ่ที่สุด" },
  { id: "encourage-30", category: "encourage", text: "คุณกำลังเดินมาถูกทางแล้ว" },
  { id: "encourage-31", category: "encourage", text: "เรื่องร้ายผ่านไป เรื่องดีกำลังมาแทน" },
  { id: "encourage-32", category: "encourage", text: "ทำดีไว้ ฟ้าเห็นเสมอ" },
  { id: "encourage-33", category: "encourage", text: "จงเชื่อว่าสิ่งดีๆ สมควรเกิดกับคุณ" },
  { id: "encourage-34", category: "encourage", text: "ทุกลมหายใจคือโอกาสใหม่" },
  { id: "encourage-35", category: "encourage", text: "รอยยิ้มของคุณเปลี่ยนวันของใครได้อีกหลายคน" },
  { id: "encourage-36", category: "encourage", text: "แม่มูเชื่อมั่นในตัวหนู ไปต่อเลยนะ" },
  { id: "luck-01", category: "luck", text: "โชคลาภกำลังเข้าสู่ชีวิตคุณในไม่ช้า" },
  { id: "luck-02", category: "luck", text: "ดวงการเงินแข็งแรง มีเงินก้อนเข้ามาให้ชื่นใจ" },
  { id: "luck-03", category: "luck", text: "ผู้ใหญ่ใจดีจะยื่นโอกาสดีๆ ให้คุณ" },
  { id: "luck-04", category: "luck", text: "เรื่องงานราบรื่น มีข่าวดีภายในสัปดาห์นี้" },
  { id: "luck-05", category: "luck", text: "ดวงความรักสดใส คนดีกำลังเข้ามา" },
  { id: "luck-06", category: "luck", text: "สุขภาพดีขึ้น ใจเบาสบายขึ้นทุกวัน" },
  { id: "luck-07", category: "luck", text: "มีลาภลอยเล็กๆ ที่ไม่คาดคิด" },
  { id: "luck-08", category: "luck", text: "เดินทางไปไหนก็มีผู้อุปถัมภ์" },
  { id: "luck-09", category: "luck", text: "การลงทุนเล็กๆ ให้ผลดีเกินคาด" },
  { id: "luck-10", category: "luck", text: "คนที่เคยเข้าใจผิด จะกลับมาคืนดี" },
  { id: "luck-11", category: "luck", text: "ดวงการค้าขายรุ่งเรือง ลูกค้าไหลมาเทมา" },
  { id: "luck-12", category: "luck", text: "เรื่องที่ติดค้างจะคลี่คลายด้วยดี" },
  { id: "luck-13", category: "luck", text: "โชคดีเกี่ยวกับตัวเลขที่ลงท้ายด้วย 9" },
  { id: "luck-14", category: "luck", text: "สีทองและสีเหลืองเสริมดวงวันนี้" },
  { id: "luck-15", category: "luck", text: "ทิศตะวันออกคือทิศมงคลของคุณ" },
  { id: "luck-16", category: "luck", text: "วันนี้เหมาะกับการเริ่มต้นสิ่งสำคัญ" },
  { id: "luck-17", category: "luck", text: "เงินที่หายไปจะกลับมาในรูปแบบอื่น" },
  { id: "luck-18", category: "luck", text: "มีคนพูดถึงคุณในทางที่ดีลับหลัง" },
  { id: "luck-19", category: "luck", text: "ดวงเสน่ห์พุ่ง ใครเห็นก็เมตตา" },
  { id: "luck-20", category: "luck", text: "โชคจากการช่วยเหลือผู้อื่นกำลังตอบแทน" },
  { id: "luck-21", category: "luck", text: "เรื่องเอกสารและสัญญาเป็นใจ" },
  { id: "luck-22", category: "luck", text: "ทรัพย์เก่ากลับมา ทรัพย์ใหม่ไหลเข้า" },
  { id: "luck-23", category: "luck", text: "ดวงดีช่วงบ่ายถึงค่ำ เปิดรับโอกาสไว้" },
  { id: "luck-24", category: "luck", text: "การเสี่ยงโชคเล็กๆ น้อยๆ เป็นใจ" },
  { id: "luck-25", category: "luck", text: "บารมีเพิ่มพูน คนเคารพนับถือมากขึ้น" },
  { id: "luck-26", category: "luck", text: "เทวดาคุ้มครอง เรื่องร้ายกลายเป็นดี" },
  { id: "luck-27", category: "luck", text: "ดวงเดินทางดี ไปไหนมาไหนปลอดภัย" },
  { id: "luck-28", category: "luck", text: "ศัตรูกลายเป็นมิตร อุปสรรคกลายเป็นโอกาส" },
  { id: "luck-29", category: "luck", text: "ผลบุญเก่าส่งผลให้คุณในสัปดาห์นี้" },
  { id: "luck-30", category: "luck", text: "ลาภผลจากเพื่อนเก่าหรือญาติมิตร" },
  { id: "luck-31", category: "luck", text: "ธุรกิจเล็กกลายเป็นใหญ่ได้ด้วยความอดทน" },
  { id: "luck-32", category: "luck", text: "ฤกษ์ดีมาถึงแล้ว ลงมือได้เลย" },
  { id: "luck-33", category: "luck", text: "ดวงโชคชั้นดี ควรทำบุญเสริมอีกนิด" },
  { id: "luck-34", category: "luck", text: "สิ่งที่ขอไว้ใกล้เป็นจริงแล้ว" },
  { id: "luck-35", category: "luck", text: "ความสำเร็จมาเยือนเมื่อคุณพร้อมที่สุด" },
  { id: "luck-36", category: "luck", text: "บ้านนี้มีโชค ครอบครัวสุขสมบูรณ์" },
];

export const LUCKY_CARD_MESSAGE_COUNT = 108;

const BY_ID = new Map(LUCKY_CARD_MESSAGES.map((m) => [m.id, m]));
export function getLuckyCardMessage(id: string): LuckyCardMessage | undefined {
  return BY_ID.get(id);
}
