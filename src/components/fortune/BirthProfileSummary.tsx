import type { BirthProfile } from "@/lib/astrology/profile";

const COLOR_HEX: Record<string, string> = {
  แดง: "#c8352d",
  เหลือง: "#f2c94c",
  ชมพู: "#f4a7bd",
  เขียว: "#3fa66b",
  ม่วง: "#8e55c9",
  ส้ม: "#ee8a2d",
  เทาดำ: "#4b4b55",
  ฟ้า: "#5fb3e6",
};

function Swatch({ name, label, avoid }: { name: string; label: string; avoid?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`relative inline-block size-4 rounded-full border ${avoid ? "border-ruby/70" : "border-gold/60"}`}
        style={{ background: COLOR_HEX[name] ?? "#888" }}
      >
        {avoid && <span className="absolute inset-0 m-auto h-[1.5px] w-5 -translate-x-[2px] rotate-45 bg-cream" />}
      </span>
      <span className="text-[12px] text-cream/90">
        {label} <span className={avoid ? "text-[#e8a0aa]" : "text-gold-light"}>{name}</span>
      </span>
    </span>
  );
}

/** Computed astrology facts shown above the reading (also captured in the share image). */
export function BirthProfileSummary({ profile }: { profile: BirthProfile }) {
  const kalakini = [...profile.kalakini.first, ...profile.kalakini.last];
  return (
    <div className="flex flex-col gap-3">
      {/* numerology */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "ผลรวมชื่อ", value: profile.numerology.first },
          { label: "ผลรวมสกุล", value: profile.numerology.last },
          { label: "ผลรวมทั้งหมด", value: profile.numerology.total, main: true },
        ].map((n) => (
          <div
            key={n.label}
            className={`rounded-2xl border px-2 py-2 ${n.main ? "border-gold/70 bg-gold/10" : "border-gold/25 bg-velvet/50"}`}
          >
            <p className="text-[11px] text-cream-muted">{n.label}</p>
            <p className={`font-tarot text-2xl font-bold ${n.main ? "text-gold-light" : "text-cream"}`}>{n.value}</p>
          </div>
        ))}
      </div>

      {/* facts */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl border border-gold/20 bg-velvet/40 px-3 py-3 text-[12px]">
        <div>
          <dt className="text-cream-muted">วันเกิด</dt>
          <dd className="text-cream">{profile.birthDay.th}</dd>
        </div>
        <div>
          <dt className="text-cream-muted">ปีนักษัตร</dt>
          <dd className="text-cream">
            ปี{profile.chineseZodiac.th} ({profile.chineseZodiac.animal})
          </dd>
        </div>
        <div>
          <dt className="text-cream-muted">ราศี</dt>
          <dd className="text-cream">{profile.thaiSign}</dd>
        </div>
        <div>
          <dt className="text-cream-muted">อักษรกาลกิณีในชื่อ</dt>
          <dd className={kalakini.length ? "text-[#e8a0aa]" : "text-jade"}>
            {kalakini.length ? kalakini.join(" ") : "ไม่มี"}
          </dd>
        </div>
      </dl>

      {/* colours */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Swatch name={profile.colors.sri} label="เสริมโชคลาภ" />
        <Swatch name={profile.colors.det} label="เสริมบารมี" />
        <Swatch name={profile.colors.avoid} label="ควรเลี่ยง" avoid />
      </div>
    </div>
  );
}
