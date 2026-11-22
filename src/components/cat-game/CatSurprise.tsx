"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { goldButtonClass } from "@/components/ui/GoldButton";
import { buildBoard, CAT_COUNT, CAT_GAME_COST, CAT_REWARDS } from "@/lib/cat-game/config";
import { dismissSurprise, isSurpriseDismissed, subscribeSurprise, surpriseDismissKey, type SurpriseState } from "@/lib/cat-game/surprise";

const SAMPLE = [buildBoard()[0], buildBoard()[1], buildBoard()[2]]; // one cat of each colour

/**
 * "Surprise" pop-up for น้องเหมียว 9 ชีวิต. Whether it applies (9..20 coins, daily chance unused) is decided on the server
 * (catSurpriseState); this component only shows it once per session / state / day and remembers a dismissal.
 */
export function CatSurprise({ userId, state, bangkokDay, balance }: { userId: string; state: SurpriseState; bangkokDay: string; balance: number }) {
  const key = surpriseDismissKey(userId, state, bangkokDay);
  // server snapshot = dismissed, so the server HTML never contains the pop-up
  const dismissed = useSyncExternalStore(
    subscribeSurprise,
    () => isSurpriseDismissed(key),
    () => true,
  );
  const open = !dismissed;
  const close = () => dismissSurprise(key);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissSurprise(key);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, key]);

  if (!open) return null;
  const offer = state === "offer";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-velvet/80 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-surprise-title"
        className="flex max-h-[92dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl border border-gold/60 bg-midnight px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-center shadow-[0_0_40px_-8px_rgb(212_175_55/0.7)] sm:rounded-3xl"
      >
        <div className="flex justify-center gap-2" aria-hidden>
          {SAMPLE.map((cat) => (
            <span key={cat.color} className="relative size-16 overflow-hidden rounded-xl border border-gold/60 shadow-[0_0_14px_-4px_rgb(243_217_139/0.8)]">
              <Image src={cat.src} alt="" fill sizes="64px" quality={60} className="object-cover" />
            </span>
          ))}
        </div>

        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ เซอร์ไพรส์ ✦</p>
        <h2 id="cat-surprise-title" className="font-display text-3xl text-gold-gradient">
          น้องเหมียว 9 ชีวิต
        </h2>

        {offer ? (
          <p className="text-sm text-cream">วันนี้คุณมีสิทธิ์จิ้มน้องเหมียวลุ้นโชคอยู่ค่ะ (เหรียญคงเหลือ {balance.toLocaleString("th-TH")})</p>
        ) : (
          <p className="text-sm text-gold-light">
            ต้องมีเหรียญอย่างน้อย {CAT_GAME_COST} เหรียญจึงจะเริ่มเล่นได้ (ตอนนี้คุณมี {balance.toLocaleString("th-TH")} เหรียญ)
          </p>
        )}

        <ul className="flex flex-col gap-1.5 rounded-2xl border border-gold/25 bg-velvet/60 p-3.5 text-left text-sm text-cream">
          <li>• ค่าเล่น <b className="text-gold-light">{CAT_GAME_COST} เหรียญ</b> เล่นได้ <b className="text-gold-light">วันละ 1 ครั้ง</b> (รีเซ็ตเที่ยงคืนเวลาไทย)</li>
          <li>• เลือกน้องเหมียว 1 ตัวจาก {CAT_COUNT} ตัว (แมวส้ม 3 · แมวดำ 3 · แมวขาว 3)</li>
          <li>• ลุ้นรับ {CAT_REWARDS.map((r) => r.toLocaleString("th-TH")).join(" / ")} เหรียญ เข้ากระเป๋าหลักทั้งหมด โอกาสออกเท่ากันระดับละ 20%</li>
        </ul>

        {offer ? (
          <Link href="/cat-game" onClick={close} className={goldButtonClass({ className: "w-full" })}>
            ไปจิ้มน้องเหมียวเลย
          </Link>
        ) : (
          <Link href="/topup" onClick={close} className={goldButtonClass({ className: "w-full" })}>
            เติมเหรียญเลย
          </Link>
        )}
        <button type="button" onClick={close} className={goldButtonClass({ variant: "ghost", className: "w-full" })}>
          ไว้ก่อน
        </button>
      </div>
    </div>
  );
}
