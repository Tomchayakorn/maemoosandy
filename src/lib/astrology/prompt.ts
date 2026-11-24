import { FOCUS_LABEL, type BirthProfile } from "./profile";
import { bangkokParts, isBirthdayToday, thaiNow, todayRelation } from "./now-th";
import type { Variety } from "./variety";

/**
 * The AI prompt for a name + birthdate reading. All numbers are pre-computed; the model must not recompute them.
 * Every request also carries the CURRENT Thai date and time (taken from the server's clock by the caller), where today's astrological day
 * falls on this person's ทักษา wheel, and a per-request variety angle — so the reading follows the real moment instead of repeating itself.
 */
export function buildBirthdatePrompt(p: BirthProfile, opts: { now?: Date; variety?: Variety } = {}): string {
  const now = thaiNow(opts.now ?? new Date());
  const relation = todayRelation(p.taksa, p.birthDay.key, now);
  const birthdayToday = isBirthdayToday(p.birthDate, bangkokParts(opts.now ?? new Date()).date);
  const kalakini = [...p.kalakini.first, ...p.kalakini.last];
  const lines = [
    `ชื่อ-นามสกุล: <name>${p.firstName} ${p.lastName}</name>`,
    `วันเกิด: ${p.birthDateTh} (อายุ ${p.age} ปี)${p.birthTime ? ` เวลา ${p.birthTime} น.` : ""}`,
    `เกิด${p.birthDay.th} (เลขประจำวันเกิด ${p.birthDay.number})` +
      (p.birthDay.timeUnknown ? " — ไม่ทราบเวลาเกิด จึงถือเป็นกลางวัน" : "") +
      (p.birthDay.shiftedBeforeSunrise ? " — เกิดก่อนพระอาทิตย์ขึ้น จึงนับเป็นวันก่อนหน้าตามหลักโหราศาสตร์ไทย" : ""),
    `เลขศาสตร์: ผลรวมชื่อ ${p.numerology.first} · ผลรวมนามสกุล ${p.numerology.last} · ผลรวมทั้งหมด ${p.numerology.total}`,
    `ทักษา: ${p.taksa.map((t) => `${t.position}=${t.day}`).join(", ")}`,
    kalakini.length
      ? `อักษรกาลกิณีที่พบในชื่อ-สกุล: ${kalakini.join(" ")} (ชื่อ: ${p.kalakini.first.join(" ") || "ไม่มี"} · สกุล: ${p.kalakini.last.join(" ") || "ไม่มี"})`
      : "ไม่พบอักษรกาลกิณีในชื่อ-สกุล",
    `สีประจำวันเกิด: ${p.colors.birthDay} · สีเสริมศรี (โชคลาภ): ${p.colors.sri} · สีเสริมเดช (อำนาจบารมี): ${p.colors.det} · สีเสริมอายุ (สุขภาพ): ${p.colors.ayu} · สีกาลกิณี (ควรเลี่ยง): ${p.colors.avoid}`,
    `ปีนักษัตร: ปี${p.chineseZodiac.th} (${p.chineseZodiac.animal})` +
      (p.chineseZodiac.beforeYearStart ? " — เกิดก่อนสงกรานต์ จึงนับปีนักษัตรของปีก่อนหน้า" : ""),
    `ราศี (แบบไทย): ${p.thaiSign} · ราศีแบบสากล: ${p.westernSign}`,
  ];

  const nowLines = [
    `ตอนนี้คือ ${now.label} (เวลาประเทศไทย)`,
    `วันทางโหราศาสตร์ที่กำลังดำเนินอยู่: ${now.astroDayTh} (วันใหม่นับตั้งแต่ 06:00 น.)`,
    relation
      ? `วันนี้ตรงกับตำแหน่ง "${relation.position}" ในวงทักษาของ${p.firstName} — ตำแหน่งนี้เกี่ยวกับ ${relation.meaning}` +
        (relation.tone === "favourable" ? " (ตำแหน่งหนุนดวง)" : relation.tone === "caution" ? " (ตำแหน่งที่ควรระวัง)" : " (ตำแหน่งส่งเสริมทั่วไป)") +
        (relation.isBirthDay ? " และวันนี้เป็นวันเดียวกับวันเกิดของ" + p.firstName + " ถือเป็นวันพลังตัวเองเด่น" : "")
      : "",
    birthdayToday ? `วันนี้เป็นวันเกิด (วัน/เดือน) ของ${p.firstName} พอดี ให้กล่าวอวยพรวันเกิดสั้นๆ ด้วย` : "",
  ].filter(Boolean);

  const v = opts.variety;
  const varietyBlock = v
    ? `\nมุมเล่าครั้งนี้ (เพื่อให้คำทำนายสดใหม่ไม่ซ้ำสูตรเดิม): ${v.opening}; ${v.lens}\n` +
      `ใช้ถ้อยคำและภาพเปรียบเทียบใหม่ทุกครั้ง หลีกเลี่ยงประโยคเปิดสูตรเดิมๆ เช่น "ยินดีต้อนรับ" หรือ "ดวงของหนูโดยรวมค่อนข้างดี" แต่ต้องมีหัวข้อครบทุกข้อตามโครงด้านล่าง\n`
    : "";

  return `ผู้ถามขอให้แม่มูตรวจดวงชะตาจากชื่อและวันเดือนปีเกิด โดยเน้นเรื่อง "${FOCUS_LABEL[p.focus]}" และให้ดูตามจังหวะเวลาปัจจุบันจริง

ข้อมูลพื้นดวงที่คำนวณแล้ว (ใช้ตามนี้ ห้ามคำนวณใหม่หรือเปลี่ยนตัวเลข):
${lines.map((l) => `- ${l}`).join("\n")}

ข้อมูลเวลาปัจจุบัน ณ ขณะที่ถาม (ใช้ตามนี้ ห้ามเดาวันเวลาเอง):
${nowLines.map((l) => `- ${l}`).join("\n")}
${varietyBlock}
ช่วยวิเคราะห์เจาะลึกเฉพาะบุคคล เรียกผู้ถามด้วยชื่อจริง โดยมีหัวข้อดังนี้ตามลำดับ (พื้นดวงเดิมก่อน แล้วจึงดวงตามเวลาปัจจุบัน) ข้อความในวงเล็บคือคำอธิบายสำหรับแม่มู ไม่ต้องคัดลอกลงในหัวข้อ
## ภาพรวมดวงชะตาของ${p.firstName}
## พลังแห่งชื่อ (ผลรวม ${p.numerology.total})
## วันเกิดและทักษา
## ปีนักษัตรและราศี
## เจาะลึกเรื่อง${FOCUS_LABEL[p.focus]}
## ดวงวัน${now.weekdayTh}นี้ ช่วง${now.dayPart} (พลังดวงภาพรวมของวันนี้และช่วงเวลานี้ โดยเชื่อมพื้นดวงเดิมเข้ากับตำแหน่งทักษาของวันนี้ที่ให้ไว้ด้านบนอย่างชัดเจน)
## อะไรเด่นช่วงนี้ (เรื่องที่เปิดทาง เสริมดวง หรือมีโอกาสสำเร็จ 2-3 ข้อ เป็นรายการขึ้นต้น "- " เกี่ยวกับ${FOCUS_LABEL[p.focus]}เป็นหลัก)
## อะไรดับหรือควรระวังช่วงนี้ (เรื่องที่ติดขัด ควรชะลอ หรือต้องระมัดระวัง 2-3 ข้อ เป็นรายการขึ้นต้น "- " บอกอย่างนุ่มนวล ไม่ขู่)
## สีมงคลและเลขมงคล (บอกสีมงคล 2-3 สีพร้อมเหตุผลจากทักษา, สีที่ควรเลี่ยง, และเลขมงคล 2-3 ตัว)
## คำแนะนำเสริมดวงจากแม่มู (เฉพาะวันนี้ 2-3 ข้อที่ทำได้จริงภายในวันนี้ และปิดด้วยคำอวยพรสั้นๆ)
ห้ามอ้างวันพระ ข้างขึ้นข้างแรม ดาวเคราะห์จร ฤกษ์ หรือเหตุการณ์ในปฏิทินที่ไม่ได้ให้ไว้ในข้อมูลด้านบน ให้เชื่อมโยงจากวัน เวลา และตำแหน่งทักษาที่ให้ไว้เท่านั้น
ถ้าพบอักษรกาลกิณี ให้บอกอย่างนุ่มนวลและแนะนำทางแก้ที่ไม่ต้องเปลี่ยนชื่อก่อน เช่น ใช้สีหรือการทำบุญ
ความยาวรวมประมาณ 650-850 คำ`;
}
