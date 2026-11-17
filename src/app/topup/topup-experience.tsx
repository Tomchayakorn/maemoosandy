"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toPng } from "html-to-image";
import { CrystalBallLoader } from "@/components/fx/CrystalBallLoader";
import { goldCelebration } from "@/components/fx/confetti";
import { formatThaiDateTime, packageName, shortReason, STATUS_LABEL } from "@/components/topup/topup-labels";
import { GoldButton, goldButtonClass } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { CoinIcon } from "@/components/ui/icons";
import { bonusCoins, PACKAGES, type PackageId } from "@/lib/packages";
import { formatCoins } from "@/lib/pricing";
import type { PromptPayQr } from "@/lib/promptpay";
import type { TopupVerifyResponse } from "@/lib/slip/types";

export type RecentTopup = {
  id: string;
  package_id: string;
  amount_thb: number;
  coins_added: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

type Phase = "pay" | "verifying" | "success" | "error";
type ApiError = { code: string; message: string };

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";
const VERIFY_MESSAGES = [
  "แม่มูกำลังตรวจสลิปของหนู...",
  "กำลังยืนยันยอดเงินกับธนาคาร...",
  "อีกนิดเดียว เหรียญกำลังเดินทางมาค่ะ...",
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-serif text-base text-gold-light">
        <span className="flex size-7 items-center justify-center rounded-full border border-gold/60 bg-velvet font-tarot text-sm text-gold-light">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function TopupExperience({
  initialBalance,
  qrs,
  receiverName,
  shopAccountNo,
  recent,
}: {
  initialBalance: number;
  qrs: Record<string, PromptPayQr>;
  receiverName: string | null;
  shopAccountNo: string | null;
  recent: RecentTopup[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<PackageId>("pkg_99");
  const [phase, setPhase] = useState<Phase>("pay");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<TopupVerifyResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pkg = PACKAGES.find((p) => p.id === selected)!;
  const qr = qrs[selected];
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (phase === "success" && result && !result.alreadyCredited) goldCelebration();
  }, [phase, result]);

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    setFileError(null);
    if (!f) return;
    if (!ACCEPT.split(",").includes(f.type)) return setFileError("รองรับเฉพาะรูป JPG, PNG หรือ WEBP ค่ะ");
    if (f.size > MAX_BYTES) return setFileError("รูปใหญ่เกิน 4MB กรุณาแคปหน้าจอสลิปใหม่ค่ะ");
    setFile(f);
  }

  async function saveQr() {
    if (qr.kind === "static") {
      const a = document.createElement("a");
      a.href = qr.src;
      a.download = `ban-na-mantra-promptpay.${qr.src.split(".").pop()}`;
      a.click();
      return;
    }
    if (!qrRef.current) return;
    const dataUrl = await toPng(qrRef.current, { pixelRatio: 3, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ban-na-mantra-promptpay-${pkg.priceThb}.png`;
    a.click();
  }

  async function submit() {
    if (!file) return setFileError("กรุณาแนบรูปสลิปก่อนนะคะ");
    setPhase("verifying");
    setError(null);
    const body = new FormData();
    body.append("packageId", selected);
    body.append("slip", file);

    let json: TopupVerifyResponse | { error: ApiError } | null = null;
    let ok = false;
    const started = performance.now();
    try {
      const res = await fetch("/api/topup/verify-slip", { method: "POST", body });
      ok = res.ok;
      json = await res.json().catch(() => null);
    } catch {
      json = null;
    }
    const wait = 1800 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    if (ok && json && "ok" in json) {
      setResult(json);
      setBalance(json.balance);
      setFile(null);
      setPhase("success");
      router.refresh(); // update the recent list
    } else {
      setError(json && "error" in json ? json.error : { code: "NETWORK", message: "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้งค่ะ" });
      setPhase("error");
    }
  }


  async function copyPromptPay() {
    if (!shopAccountNo) return;
    try {
      await navigator.clipboard.writeText(shopAccountNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFileError("คัดลอกไม่สำเร็จ กรุณากดค้างที่เบอร์เพื่อคัดลอกเองค่ะ");
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {/* balance */}
      <div className="flex items-center justify-between rounded-full border border-gold/40 bg-velvet/70 px-4 py-2.5 text-sm">
        <span className="text-cream-muted">เหรียญคงเหลือ</span>
        <span className="flex items-center gap-1.5 font-semibold text-gold-light">
          <CoinIcon className="size-5" /> {formatCoins(balance)} เหรียญ
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === "pay" && (
          <motion.div key="pay" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-7">
            {/* ① packages */}
            <Step n={1} title="เลือกแพ็กเกจ">
              <div role="radiogroup" aria-label="แพ็กเกจเติมเหรียญ" className="grid grid-cols-2 gap-3">
                {PACKAGES.map((p) => {
                  const active = p.id === selected;
                  const bonus = bonusCoins(p);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelected(p.id)}
                      className={`relative flex flex-col items-center gap-1 rounded-3xl border px-3 pb-3 pt-5 text-center transition ${
                        active
                          ? "border-gold bg-[linear-gradient(160deg,rgb(212_175_55/0.18),rgb(18_26_51/0.95))] shadow-[0_0_22px_-6px_rgb(212_175_55/0.8)]"
                          : "border-gold/25 bg-velvet-soft/80 hover:border-gold/60"
                      }`}
                    >
                      {p.badge && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[linear-gradient(135deg,var(--gold-light),var(--gold))] px-2.5 py-0.5 text-[11px] font-semibold text-velvet">
                          {p.badge}
                        </span>
                      )}
                      <span className="text-[12px] text-cream-muted">{p.name}</span>
                      <span className="flex items-center gap-1 font-tarot text-2xl font-bold text-gold-light">
                        <CoinIcon className="size-5" />
                        {formatCoins(p.coins)}
                      </span>
                      {bonus > 0 ? (
                        <span className="rounded-full bg-jade/20 px-2 py-0.5 text-[11px] text-[#9fe0c0]">+{bonus} โบนัส</span>
                      ) : (
                        <span className="h-[22px]" />
                      )}
                      <span className="mt-1 text-sm font-semibold text-cream">{p.priceThb} บาท</span>
                      <span className="text-[11px] leading-snug text-cream-muted/80">{p.note}</span>
                    </button>
                  );
                })}
              </div>
            </Step>

            {/* ② QR */}
            <Step n={2} title="สแกนจ่ายด้วยพร้อมเพย์">
              <MysticCard className="flex flex-col items-center gap-4 p-5">
                <div className="relative w-full max-w-[17rem] rounded-[1.75rem] bg-[conic-gradient(from_210deg,#7a5a12,#f9e7a6,#d4af37,#fff6d5,#b8891f,#6e4f0e,#f3d98b,#7a5a12)] p-[3px] shadow-[0_0_30px_-6px_rgb(212_175_55/0.7)]">
                  <div ref={qrRef} className="flex flex-col items-center overflow-hidden rounded-[1.6rem] bg-white">
                    {qr.kind === "static" ? (
                      // The owner's own screenshot (Thai QR Payment + account holder name). The bottom bank banner
                      // is cropped away; unoptimized keeps the QR byte-for-byte so it always scans.
                      <div className="relative aspect-[739/1005] w-full">
                        <Image
                          src={qr.src}
                          alt="QR พร้อมเพย์ของบ้าน ณ มัณตรา"
                          fill
                          unoptimized
                          loading="eager"
                          sizes="272px"
                          className="object-cover object-top"
                        />
                      </div>
                    ) : qr.kind === "dynamic" ? (
                      <div className="flex flex-col items-center gap-2 px-5 pb-2 pt-4">
                        <p className="font-tarot text-[11px] font-bold tracking-[0.2em] text-[#1d3c6e]">PROMPTPAY</p>
                        <div className="size-52 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr.svg }} />
                        {receiverName && <p className="text-[12px] text-[#4b4b55]">ชื่อบัญชี: {receiverName}</p>}
                      </div>
                    ) : (
                      <div className="m-5 flex size-52 items-center justify-center rounded-xl border border-dashed border-[#c9b37a] p-4 text-center text-sm text-[#6e5a2a]">
                        แอดมินยังไม่ได้ตั้งค่า QR พร้อมเพย์ค่ะ
                      </div>
                    )}
                    <div className="flex w-full flex-col items-center border-t border-[#e6dcc0] bg-[#fff9e6] px-4 py-2.5">
                      <p className="text-[11px] text-[#6e5a2a]">{qr.kind === "dynamic" ? "ยอดที่ต้องโอน" : "กรุณาโอนให้ตรงยอด"}</p>
                      <p className="font-tarot text-2xl font-bold text-[#0b0a12]">
                        {pkg.priceThb.toFixed(2)} <span className="font-sans text-sm font-normal">บาท</span>
                      </p>
                    </div>
                  </div>
                </div>

                <ul className="flex w-full flex-col gap-1 text-[13px] leading-relaxed text-cream/85">
                  <li>✦ เปิดแอปธนาคาร สแกน QR นี้ {qr.kind === "dynamic" ? "(ยอดเงินใส่ไว้ให้แล้ว)" : `แล้วกรอกยอดให้ตรง ${pkg.priceThb} บาท (QR นี้ไม่ได้ใส่ยอดไว้ให้)`}</li>
                  <li>✦ โอนเสร็จแล้ว แคปหน้าจอสลิปที่มี QR Code มุมขวาล่าง</li>
                </ul>


                {shopAccountNo && (
                  <div className="flex w-full flex-col gap-2 rounded-2xl border border-gold/40 bg-midnight/60 p-4 text-center">
                    <p className="text-xs text-cream-muted">พร้อมเพย์ (PromptPay)</p>
                    <p className="font-tarot text-2xl font-bold tracking-wider text-gold-light">
                      {shopAccountNo.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3")}
                    </p>
                    {receiverName && <p className="text-sm text-cream">ชื่อบัญชี: {receiverName}</p>}
                    <button type="button" onClick={copyPromptPay} className={goldButtonClass({ variant: "outline", className: "w-full" })}>
                      {copied ? "คัดลอกแล้ว ✓" : "คัดลอกเบอร์พร้อมเพย์"}
                    </button>
                  </div>
                )}

                {qr.kind !== "none" && (
                  <button type="button" onClick={saveQr} className={goldButtonClass({ variant: "outline", className: "w-full" })}>
                    บันทึกรูป QR
                  </button>
                )}
              </MysticCard>
            </Step>

            {/* ③ slip */}
            <Step n={3} title="แนบสลิปเพื่อรับเหรียญ">
              <input ref={fileInput} type="file" accept={ACCEPT} onChange={onPickFile} className="hidden" />
              {file && previewUrl ? (
                <div className="flex items-center gap-4 rounded-3xl border border-gold/40 bg-velvet-soft/80 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
                  <img src={previewUrl} alt="ตัวอย่างสลิป" className="h-28 w-20 rounded-xl border border-gold/30 object-cover" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="truncate text-sm text-cream">{file.name}</p>
                    <p className="text-xs text-cream-muted">{(file.size / 1024).toFixed(0)} KB</p>
                    <button type="button" onClick={() => fileInput.current?.click()} className="self-start text-xs text-gold-light underline-offset-4 hover:underline">
                      เปลี่ยนรูป
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-gold/40 bg-velvet/50 px-4 py-8 text-center transition hover:border-gold hover:bg-gold/5"
                >
                  <svg viewBox="0 0 24 24" className="size-9 text-gold" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 16V4m0 0-4 4m4-4 4 4" />
                    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                  </svg>
                  <span className="text-sm text-cream">แตะเพื่อแนบรูปสลิป</span>
                  <span className="text-xs text-cream-muted">JPG / PNG / WEBP ไม่เกิน 4MB</span>
                </button>
              )}

              {fileError && (
                <p role="alert" className="rounded-xl border border-ruby/50 bg-ruby/10 px-4 py-3 text-sm text-cream">
                  {fileError}
                </p>
              )}

              <button type="button" onClick={submit} disabled={!file} className={goldButtonClass({ size: "lg", className: "w-full" })}>
                ตรวจสลิปและรับ {formatCoins(pkg.coins)} เหรียญ
              </button>
            </Step>
          </motion.div>
        )}

        {phase === "verifying" && (
          <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CrystalBallLoader messages={VERIFY_MESSAGES} />
          </motion.div>
        )}

        {phase === "success" && result && (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <MysticCard className="flex flex-col items-center gap-4 overflow-hidden px-6 py-8 text-center">
              <div aria-hidden className="absolute -top-20 left-1/2 size-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(212_175_55/0.35),transparent_70%)]" />
              <motion.div
                initial={reduce ? false : { scale: 0, rotate: -40 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 12 }}
                className="relative"
              >
                <CoinIcon className="size-20 drop-shadow-[0_0_24px_rgb(212_175_55/0.8)]" />
              </motion.div>
              {result.alreadyCredited ? (
                <>
                  <p className="relative font-serif text-lg text-gold-light">สลิปนี้เติมให้หนูไปแล้วค่ะ</p>
                  <p className="relative text-sm text-cream-muted">ไม่มีการเติมซ้ำ ยอดคงเหลือ {formatCoins(result.balance)} เหรียญ</p>
                </>
              ) : (
                <>
                  <p className="relative font-display text-4xl">
                    <span className="text-gold-gradient">+{formatCoins(result.coinsAdded)} เหรียญ</span>
                  </p>
                  <p className="relative text-sm text-cream">เติมเหรียญสำเร็จแล้วค่ะ · คงเหลือ {formatCoins(result.balance)} เหรียญ</p>
                </>
              )}
              <div className="relative mt-2 grid w-full grid-cols-2 gap-3">
                <GoldButton href="/tarot" className="w-full">เปิดไพ่ยิปซี</GoldButton>
                <GoldButton href="/birthdate" variant="outline" className="w-full">ดูดวงวันเกิด</GoldButton>
              </div>
              <button type="button" onClick={() => setPhase("pay")} className="relative text-xs text-cream-muted underline-offset-4 hover:underline">
                เติมเหรียญเพิ่ม
              </button>
            </MysticCard>
          </motion.div>
        )}

        {phase === "error" && error && (
          <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <MysticCard className="flex flex-col items-center gap-4 p-6 text-center">
              <p className="font-serif text-lg text-gold-light">ตรวจสลิปไม่ผ่านค่ะ</p>
              <p className="text-sm leading-relaxed text-cream/90">{error.message}</p>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPhase("pay");
                }}
                className={goldButtonClass({ size: "lg", className: "w-full" })}
              >
                แนบสลิปใหม่
              </button>
              <p className="text-xs text-cream-muted">หากโอนแล้วแต่ยังไม่ได้รับเหรียญ ติดต่อแอดมินพร้อมสลิปได้เลยค่ะ</p>
            </MysticCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* recent */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-base text-gold-light">รายการเติมเหรียญล่าสุด</h2>
          <Link href="/history" className="text-xs text-cream-muted underline-offset-4 hover:underline">
            ดูประวัติทั้งหมด
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-gold/15 bg-velvet/50 px-4 py-4 text-center text-sm text-cream-muted">ยังไม่มีรายการเติมเหรียญค่ะ</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gold/10 overflow-hidden rounded-2xl border border-gold/15 bg-velvet/50">
            {recent.map((t) => {
              const label = STATUS_LABEL[t.status] ?? STATUS_LABEL.pending;
              const reason = t.status === "success" ? null : shortReason(t.failure_reason);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cream">
                      {packageName(t.package_id)} · {Number(t.amount_thb)} บาท
                    </p>
                    <p className="text-[11px] text-cream-muted">
                      {formatThaiDateTime(t.created_at)}
                      {reason ? ` · ${reason}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${label.className}`}>{label.text}</span>
                    {t.coins_added > 0 && <span className="text-xs font-semibold text-gold-light">+{t.coins_added}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
