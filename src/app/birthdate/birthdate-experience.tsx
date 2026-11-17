"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CrystalBallLoader } from "@/components/fx/CrystalBallLoader";
import { goldCelebration } from "@/components/fx/confetti";
import { BirthProfileSummary } from "@/components/fortune/BirthProfileSummary";
import { ReadAloudControl } from "@/components/fortune/ReadAloudControl";
import { ReadingCard } from "@/components/fortune/ReadingCard";
import { ShareButton } from "@/components/fortune/ShareButton";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { CoinIcon } from "@/components/ui/icons";
import { parseBirthDate, THAI_MONTHS, type CalendarKind } from "@/lib/astrology/calendar";
import { sumName } from "@/lib/astrology/numerology";
import { FOCUS_LABEL, type FocusTopic } from "@/lib/astrology/profile";
import type { BirthdateResponse } from "@/lib/astrology/types";
import { FORTUNE_PRICES, formatCoins } from "@/lib/pricing";
import { unlockSpeech } from "@/lib/tts/speech";

type Phase = "form" | "loading" | "result" | "error";
type ApiError = { code: string; message: string };

const PRICE = FORTUNE_PRICES.birthdate;
const MIN_LOADING_MS = 3200;

const LOADING_MESSAGES = [
  "แม่มูกำลังถอดรหัสเลขศาสตร์ชื่อของหนู...",
  "กำลังเปิดทักษาตามวันเกิด...",
  "ดวงดาวประจำราศีกำลังเรียงตัว...",
  "กำลังถอดรหัสจากบ้าน ณ มัณตรา...",
];

const FOCUS_OPTIONS: FocusTopic[] = ["overall", "career", "love"];

const inputClass =
  "h-12 w-full rounded-xl border border-gold/30 bg-velvet/70 px-3 text-[15px] text-cream placeholder:text-cream-muted/50 " +
  "outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/30";
const labelClass = "flex flex-col gap-1.5 text-sm text-cream-muted";

export function BirthdateExperience({
  initialBalance,
  initialFreeTickets,
}: {
  initialBalance: number;
  initialFreeTickets: number;
}) {
  const [phase, setPhase] = useState<Phase>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [calendar, setCalendar] = useState<CalendarKind>("BE");
  const [birthTime, setBirthTime] = useState("");
  const [focus, setFocus] = useState<FocusTopic>("overall");
  const [useFree, setUseFree] = useState(initialFreeTickets > 0);
  const [balance, setBalance] = useState(initialBalance);
  const [freeTickets, setFreeTickets] = useState(initialFreeTickets);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<BirthdateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [typingDone, setTypingDone] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  /** Wrap a field setter so editing any field clears a stale validation message. */
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setFormError(null);
      set(value);
    };

  const payingWithTicket = useFree && freeTickets > 0;
  const canAfford = payingWithTicket || balance >= PRICE;

  // Live numerology preview while typing (the server recomputes everything for the reading).
  const preview = useMemo(() => {
    const f = sumName(firstName).total;
    const l = sumName(lastName).total;
    return f || l ? { f, l, total: f + l } : null;
  }, [firstName, lastName]);

  // Room backdrop: show Mae Mu Sandy while filling the form, deepen the tint for the reading.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tarotMood = phase === "form" ? "portrait" : "reading";
    return () => {
      delete root.dataset.tarotMood;
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "result") goldCelebration();
  }, [phase]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) return setFormError("กรุณากรอกชื่อและนามสกุลให้ครบค่ะ");
    const parsed = parseBirthDate({ day: Number(day), month: Number(month), year: Number(year), calendar });
    if (!parsed.ok) return setFormError(parsed.error);
    if (!canAfford) return;

    // The submit tap is the last user gesture before the reading arrives; mobile browsers need it for speech.
    unlockSpeech();
    setPhase("loading");
    const started = performance.now();
    let body: BirthdateResponse | { error: ApiError } | null = null;
    let ok = false;
    try {
      const res = await fetch("/api/fortune/birthdate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          day: Number(day),
          month: Number(month),
          year: Number(year),
          calendar,
          birthTime: birthTime || null,
          focus,
          useFreeTicket: payingWithTicket,
        }),
      });
      ok = res.ok;
      body = await res.json().catch(() => null);
    } catch {
      body = null;
    }

    const wait = MIN_LOADING_MS - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    if (ok && body && "reading" in body) {
      setResult(body);
      setBalance(body.balance);
      setFreeTickets(body.freeReadingTickets);
      setTypingDone(false);
      setPhase("result");
    } else {
      setError(
        body && "error" in body
          ? body.error
          : { code: "NETWORK", message: "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ค่ะ" },
      );
      setPhase("error");
    }
  }

  function backToForm() {
    setResult(null);
    setError(null);
    setUseFree(freeTickets > 0);
    setPhase("form");
  }

  return (
    <AnimatePresence mode="wait">
      {/* ---------------- FORM ---------------- */}
      {phase === "form" && (
        <motion.section
          key="form"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="flex flex-col gap-5"
        >
          <div className="flex h-[30svh] min-h-40 items-end justify-center">
            <p className="on-photo rounded-full border border-gold/30 bg-velvet/45 px-4 py-1.5 font-serif text-sm text-gold-light backdrop-blur-sm">
              ✦ บอกชื่อและวันเกิด แล้วแม่มูจะถอดรหัสให้ค่ะ ✦
            </p>
          </div>

          <MysticCard className="p-5 shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.8)]">
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  ชื่อจริง
                  <input
                    value={firstName}
                    onChange={(e) => edit(setFirstName)(e.target.value.slice(0, 60))}
                    autoComplete="given-name"
                    placeholder="เช่น สมชาย"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  นามสกุล
                  <input
                    value={lastName}
                    onChange={(e) => edit(setLastName)(e.target.value.slice(0, 60))}
                    autoComplete="family-name"
                    placeholder="เช่น ใจดี"
                    className={inputClass}
                  />
                </label>
              </div>

              {preview && (
                <p className="-mt-1 text-center text-xs text-cream-muted">
                  ผลรวมเลขศาสตร์ชื่อ-สกุล{" "}
                  <span className="font-tarot text-sm font-bold text-gold-light">
                    {preview.f} + {preview.l} = {preview.total}
                  </span>
                </p>
              )}

              <fieldset className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <legend className="text-sm text-cream-muted">วัน / เดือน / ปีเกิด</legend>
                  <div role="radiogroup" aria-label="ปฏิทิน" className="flex rounded-full border border-gold/30 bg-velvet/60 p-0.5 text-xs">
                    {(["BE", "CE"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={calendar === c}
                        onClick={() => edit(setCalendar)(c)}
                        className={`rounded-full px-3 py-1 transition ${
                          calendar === c ? "bg-[linear-gradient(135deg,var(--gold-light),var(--gold))] text-velvet" : "text-cream-muted"
                        }`}
                      >
                        {c === "BE" ? "พ.ศ." : "ค.ศ."}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_1.6fr_1.3fr] gap-2">
                  <select aria-label="วันที่" value={day} onChange={(e) => edit(setDay)(e.target.value)} className={inputClass}>
                    <option value="">วัน</option>
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                  <select aria-label="เดือน" value={month} onChange={(e) => edit(setMonth)(e.target.value)} className={inputClass}>
                    <option value="">เดือน</option>
                    {THAI_MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={calendar === "BE" ? "ปีเกิด พ.ศ." : "ปีเกิด ค.ศ."}
                    value={year}
                    onChange={(e) => edit(setYear)(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    placeholder={calendar === "BE" ? "2533" : "1990"}
                    className={inputClass}
                  />
                </div>
              </fieldset>

              <label className={labelClass}>
                <span>
                  เวลาเกิด <span className="text-xs text-cream-muted/70">(ไม่บังคับ — ใช้ดูพุธกลางวัน/กลางคืน)</span>
                </span>
                <input type="time" value={birthTime} onChange={(e) => edit(setBirthTime)(e.target.value)} className={inputClass} />
              </label>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm text-cream-muted">เรื่องที่อยากให้แม่มูเน้น</legend>
                <div role="radiogroup" className="grid grid-cols-3 gap-2">
                  {FOCUS_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={focus === f}
                      onClick={() => setFocus(f)}
                      className={`min-h-11 rounded-xl border px-2 py-2 text-[13px] leading-tight transition ${
                        focus === f
                          ? "border-gold bg-gold/15 text-gold-light shadow-[0_0_12px_-4px_rgb(212_175_55/0.7)]"
                          : "border-gold/25 bg-velvet/50 text-cream-muted hover:text-cream"
                      }`}
                    >
                      {FOCUS_LABEL[f]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {freeTickets > 0 && (
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-jade/40 bg-jade/10 px-4 py-3 text-sm text-cream">
                  <input
                    type="checkbox"
                    checked={useFree}
                    onChange={(e) => setUseFree(e.target.checked)}
                    className="size-5 accent-[var(--gold)]"
                  />
                  ใช้สิทธิ์ดูดวงฟรี (เหลือ {freeTickets} ครั้ง)
                </label>
              )}

              <div className="flex items-center justify-between rounded-2xl bg-velvet/60 px-4 py-3 text-sm">
                <span className="text-cream-muted">ค่าตรวจดวง</span>
                <span className="flex items-center gap-1.5 font-semibold text-gold-light">
                  {payingWithTicket ? (
                    "ใช้สิทธิ์ฟรี 1 ครั้ง"
                  ) : (
                    <>
                      <CoinIcon className="size-4" /> {formatCoins(PRICE)} เหรียญ
                      <span className="font-normal text-cream-muted">(มี {formatCoins(balance)})</span>
                    </>
                  )}
                </span>
              </div>

              {!canAfford && (
                <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 px-4 py-4 text-center text-sm text-cream">
                  เหรียญยังไม่พอตรวจดวงค่ะ ขาดอีก {formatCoins(PRICE - balance)} เหรียญ
                  <GoldButton href="/topup" className="w-full">
                    <CoinIcon className="size-5" /> เติมเหรียญ
                  </GoldButton>
                </div>
              )}

              {formError && (
                <p role="alert" className="rounded-xl border border-ruby/50 bg-ruby/10 px-4 py-3 text-sm text-cream">
                  {formError}
                </p>
              )}

              <button type="submit" disabled={!canAfford} className={goldButtonClass({ size: "lg", className: "w-full" })}>
                ให้แม่มูถอดรหัสดวงชะตา
              </button>
              <p className="text-center text-[11px] text-cream-muted/70">ชื่อและวันเกิดใช้เพื่อการทำนายของหนูเท่านั้นค่ะ</p>
            </form>
          </MysticCard>
        </motion.section>
      )}

      {/* ---------------- LOADING ---------------- */}
      {phase === "loading" && (
        <motion.section key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-[12svh]">
          <CrystalBallLoader messages={LOADING_MESSAGES} />
        </motion.section>
      )}

      {/* ---------------- RESULT ---------------- */}
      {phase === "result" && result && (
        <motion.section
          key="result"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-4"
        >
          <ReadAloudControl text={result.reading} />

          <ReadingCard
            ref={shareRef}
            title={`ดวงชะตาของ${result.profile.firstName}`}
            subtitle={
              <>
                เกิด{result.profile.birthDay.th} · {result.profile.birthDateTh}
                <br />
                เน้นเรื่อง{FOCUS_LABEL[result.profile.focus]}
              </>
            }
            header={<BirthProfileSummary profile={result.profile} />}
            text={result.reading}
            onTypingDone={() => setTypingDone(true)}
          />

          <ShareButton targetRef={shareRef} disabled={!typingDone} fileName="mae-mu-sandy-birthdate.png" />

          <p className="on-photo text-center text-xs text-cream">
            {result.usedFreeTicket ? "ใช้สิทธิ์ดูดวงฟรีแล้ว" : `หัก ${formatCoins(PRICE)} เหรียญแล้ว`} · คงเหลือ{" "}
            {formatCoins(balance)} เหรียญ
          </p>

          <button type="button" onClick={backToForm} className={goldButtonClass({ size: "lg", className: "w-full" })}>
            ตรวจดวงอีกครั้ง
          </button>
        </motion.section>
      )}

      {/* ---------------- ERROR ---------------- */}
      {phase === "error" && error && (
        <motion.section key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-[12svh]">
          <MysticCard className="flex flex-col items-center gap-4 p-6 text-center">
            <p className="font-serif text-lg text-gold-light">
              {error.code === "INSUFFICIENT_COINS" ? "เหรียญไม่เพียงพอ" : "ขออภัยค่ะ"}
            </p>
            <p className="text-sm leading-relaxed text-cream/90">{error.message}</p>
            {error.code === "INSUFFICIENT_COINS" ? (
              <GoldButton href="/topup" size="lg" className="w-full">
                <CoinIcon className="size-5" /> เติมเหรียญ
              </GoldButton>
            ) : (
              <button type="button" onClick={backToForm} className={goldButtonClass({ size: "lg", className: "w-full" })}>
                กลับไปแก้ไขข้อมูล
              </button>
            )}
          </MysticCard>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
