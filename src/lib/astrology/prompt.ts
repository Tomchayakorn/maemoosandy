import "server-only";

import { FOCUS_LABEL, type BirthProfile } from "./profile";

/** The AI prompt for a name + birthdate reading. All numbers are pre-computed; the model must not recompute them. */
export function buildBirthdatePrompt(p: BirthProfile): string {
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

  return `ผู้ถามขอให้แม่มูตรวจดวงชะตาจากชื่อและวันเดือนปีเกิด โดยเน้นเรื่อง "${FOCUS_LABEL[p.focus]}"

ข้อมูลที่คำนวณแล้ว (ใช้ตามนี้ ห้ามคำนวณใหม่หรือเปลี่ยนตัวเลข):
${lines.map((l) => `- ${l}`).join("\n")}

ช่วยวิเคราะห์เจาะลึกเฉพาะบุคคล เรียกผู้ถามด้วยชื่อจริง โดยมีหัวข้อดังนี้
## ภาพรวมดวงชะตาของ${p.firstName}
## พลังแห่งชื่อ (ผลรวม ${p.numerology.total})
## วันเกิดและทักษา
## ปีนักษัตรและราศี
## เจาะลึกเรื่อง${FOCUS_LABEL[p.focus]}
## สีมงคลและเลขมงคล (บอกสีมงคล 2-3 สีพร้อมเหตุผลจากทักษา, สีที่ควรเลี่ยง, และเลขมงคล 2-3 ตัว)
## คำแนะนำเสริมดวงจากแม่มู
ถ้าพบอักษรกาลกิณี ให้บอกอย่างนุ่มนวลและแนะนำทางแก้ที่ไม่ต้องเปลี่ยนชื่อก่อน เช่น ใช้สีหรือการทำบุญ
ความยาวรวมประมาณ 450-650 คำ`;
}
