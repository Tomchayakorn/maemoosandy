import { CARDS, CLEAR_BONUS, COST, DAILY_ROUNDS, MAX_PAYOUT, MAX_TURNS, PAIR_REWARD, PAIRS } from "@/lib/match-game/config";
import { RuleList, RuleSection } from "./RuleParts";

/** Rules of จับคู่ภาพเหมือน. Numbers come from the constants the game uses (a test keeps the SQL in sync with them). */
export function MatchRules() {
  return (
    <>
      <RuleSection title="1. วิธีเล่น">
        <RuleList>
          <li>ค่าเล่นรอบละ {COST} เหรียญ ระบบหักตอนกดเริ่มรอบ มีไพ่คว่ำ {CARDS} ใบ เป็นสัญลักษณ์มงคล {PAIRS} คู่</li>
          <li>เปิดไพ่ครั้งละ 2 ใบ (นับเป็น 1 เทิร์น) ถ้าเหมือนกันจะเปิดค้างไว้ ถ้าไม่เหมือนจะคว่ำกลับ</li>
          <li>เล่นได้สูงสุด {MAX_TURNS} เทิร์นต่อรอบ รอบจบเมื่อจับคู่ครบ หรือใช้เทิร์นหมด</li>
          <li>ตำแหน่งไพ่ถูกสับโดยระบบหลังบ้านตอนเริ่มรอบ และเปลี่ยนไม่ได้ระหว่างเล่น</li>
        </RuleList>
      </RuleSection>

      <RuleSection title="2. รางวัล">
        <RuleList>
          <li>จับคู่สำเร็จ <b>คู่ละ +{PAIR_REWARD} เหรียญ</b> เข้ากระเป๋าเหรียญทันที</li>
          <li>จับครบ {PAIRS} คู่ภายใน {MAX_TURNS} เทิร์น รับ<b>โบนัสเพิ่ม +{CLEAR_BONUS} เหรียญ</b></li>
          <li>รับสูงสุดรอบละ {MAX_PAYOUT} เหรียญ (ค่าเล่น {COST} เหรียญ) ผลลัพธ์ขึ้นกับความจำและโชคในแต่ละรอบ อาจได้น้อยกว่าค่าเล่น</li>
        </RuleList>
      </RuleSection>

      <RuleSection title="3. เงื่อนไขอื่น">
        <RuleList>
          <li>เล่นได้ <b>วันละ {DAILY_ROUNDS} รอบ</b> ต่อบัญชี นับตามวันของประเทศไทย เริ่มนับใหม่หลังเที่ยงคืน</li>
          <li>มีรอบที่ยังเล่นค้างได้ครั้งละ 1 รอบ หากออกจากหน้าเกมกลางคันหรือเน็ตหลุด กลับมาแล้วเล่นรอบเดิมต่อได้ ไม่หักเหรียญซ้ำ</li>
          <li>เหรียญรางวัลใช้ในระบบเท่านั้น ไม่ใช่รางวัลถอนเงิน และเกมนี้ไม่มีการถอนเป็นเงิน</li>
          <li>หากพบปัญหา ติดต่อแอดมินผ่านปุ่ม LINE</li>
        </RuleList>
      </RuleSection>
    </>
  );
}
