"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useReadAloud } from "@/lib/tts/useReadAloud";

function SpeakerIcon({ off, className = "" }: { off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" fillOpacity="0.25" />
      {off ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  );
}

function SoundBars() {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className="flex h-4 items-end gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-gold-light"
          initial={{ height: 4 }}
          animate={reduce ? { height: 10 } : { height: [4, 14, 6, 12, 4] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** "Mae Mu is reading" bar: play / pause / replay plus a remembered auto-read toggle. */
export function ReadAloudControl({ text }: { text: string }) {
  const { status, muted, basicVoice, play, pause, resume, toggleMuted } = useReadAloud(text);

  if (status === "unsupported") {
    return (
      <p className="rounded-2xl border border-gold/20 bg-velvet/60 px-4 py-3 text-center text-xs text-cream-muted">เบราว์เซอร์นี้ยังไม่รองรับการอ่านออกเสียงค่ะ</p>
    );
  }
  if (status === "no-voice") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-gold/20 bg-velvet/60 px-4 py-3 text-center text-xs text-cream-muted">
        <p>อุปกรณ์นี้ยังไม่มีเสียงอ่านภาษาไทย — เพิ่มเสียงภาษาไทยในการตั้งค่าเครื่องแล้วลองใหม่ได้นะคะ</p>
        <button
          type="button"
          onClick={() => void play()}
          data-testid="read-aloud-retry"
          className="h-10 rounded-full border border-gold/50 px-5 text-sm text-gold-light transition hover:bg-gold/10"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  const speaking = status === "speaking";
  const blocked = status === "blocked";
  const label =
    status === "loading"
      ? "แม่มูกำลังเตรียมเสียง..."
      : blocked
        ? "แตะเพื่อฟังแม่มูอ่านคำทำนาย"
        : speaking
        ? "แม่มูกำลังอ่านคำทำนาย"
        : status === "paused"
          ? "หยุดฟังไว้ชั่วคราว"
          : status === "done"
            ? "ฟังคำทำนายอีกครั้ง"
            : "ฟังแม่มูอ่านคำทำนาย";

  function handleMain() {
    if (speaking) pause();
    else if (status === "paused") resume();
    else void play();
  }

  const bar = (
    <div className={"flex items-center gap-2 rounded-full border bg-velvet/70 p-1.5 pl-2 shadow-[0_0_18px_-6px_rgb(212_175_55/0.5)] " + (blocked ? "border-gold-light" : "border-gold/40")}>
      <button
        type="button"
        onClick={handleMain}
        data-testid="read-aloud-main"
        aria-label={speaking ? "หยุดอ่านชั่วคราว" : status === "paused" ? "อ่านต่อ" : "เล่นเสียงอ่านคำทำนาย"}
        className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-full px-2 text-left text-sm text-cream transition hover:bg-gold/10"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--gold-light),var(--gold))] text-velvet">
          {speaking ? (
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-4 translate-x-[1px]" fill="currentColor" aria-hidden>
              <path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5Z" />
            </svg>
          )}
        </span>
        <span className="truncate">{label}</span>
        {speaking && <SoundBars />}
      </button>

      <button
        type="button"
        onClick={toggleMuted}
        aria-pressed={!muted}
        aria-label={muted ? "เปิดอ่านออกเสียงอัตโนมัติ" : "ปิดอ่านออกเสียงอัตโนมัติ"}
        title={muted ? "อ่านอัตโนมัติ: ปิด" : "อ่านอัตโนมัติ: เปิด"}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition ${
          muted ? "border-gold/20 text-cream-muted hover:text-cream" : "border-gold/50 text-gold-light hover:bg-gold/10"
        }`}
      >
        <SpeakerIcon off={muted} className="size-5" />
      </button>
    </div>
  );

  // Compact on-device voices sound robotic; tell people how to get a better one.
  const voiceTip = basicVoice && !muted && (
    <details className="px-3 text-xs text-cream-muted">
      <summary className="cursor-pointer select-none text-gold-light/80">อยากได้เสียงแม่มูที่นุ่มนวลขึ้น?</summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 leading-relaxed">
        <li>iPhone / iPad: ตั้งค่า › การช่วยการเข้าถึง › เนื้อหาที่พูด › เสียง › ไทย › ดาวน์โหลด Kanya (ปรับปรุง)</li>
        <li>Mac: การตั้งค่าระบบ › การช่วยการเข้าถึง › เนื้อหาที่พูด › เสียงระบบ › จัดการเสียง › ไทย › Kanya (Enhanced)</li>
        <li>Windows / Android: เปิดเว็บด้วย Microsoft Edge หรือ Google Chrome จะได้เสียงไทยที่เป็นธรรมชาติกว่า</li>
      </ul>
    </details>
  );

  // the browser refused to start the reading by itself: say why and what to do (a tap on the button above always works)
  const blockedNote = blocked && (
    <p role="status" data-testid="read-aloud-blocked" className="px-3 text-center text-xs text-gold-light">
      เบราว์เซอร์บนมือถือมักบล็อกเสียงที่เริ่มเอง — แตะปุ่มด้านบนหนึ่งครั้งเพื่อให้แม่มูอ่านคำทำนายค่ะ
    </p>
  );

  return (
    <div className="flex flex-col gap-2">
      {bar}
      {blockedNote}
      {voiceTip}
    </div>
  );
}
