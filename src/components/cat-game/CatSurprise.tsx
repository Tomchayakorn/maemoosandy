"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CatBoard } from "@/components/cat-game/CatBoard";
import { goldButtonClass, GoldButton } from "@/components/ui/GoldButton";
import { CAT_COUNT, CAT_GAME_COST, CAT_REWARDS, catBlessing } from "@/lib/cat-game/config";
import type { SurpriseState } from "@/lib/cat-game/surprise";
import { formatCoins } from "@/lib/pricing";

export type SurprisePhase =
  | { name: "pick" }
  | { name: "loading"; index: number }
  | { name: "result"; index: number; reward: number; message?: string };

/**
 * The "surprise" pop-up for น้องเหมียว 9 ชีวิต: a playable 3×3 board right inside the modal. View only — CatSurpriseLive owns the state
 * and talks to POST /api/cat-game/play. With 0–8 coins the board is locked and a top-up shortcut is shown.
 */
export function CatSurprise({
  mode,
  balance,
  phase,
  error,
  onPick,
  onClose,
  tileRefs,
}: {
  mode: SurpriseState;
  balance: number;
  phase: SurprisePhase;
  error: string | null;
  onPick: (index: number) => void;
  onClose: () => void;
  tileRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  const reduce = useReducedMotion();
  const drawing = phase.name === "loading";
  const locked = mode === "low" || phase.name !== "pick";

  // Escape closes (not while a round is being drawn)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !drawing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-velvet/80 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={(e) => e.target === e.currentTarget && !drawing && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cat-surprise-title"
        className="flex max-h-[94dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl border border-gold/60 bg-midnight px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center shadow-[0_0_40px_-8px_rgb(212_175_55/0.7)] sm:rounded-3xl"
      >
        <div>
          <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ เซอร์ไพรส์ ✦</p>
          <h2 id="cat-surprise-title" className="font-display text-3xl text-gold-gradient">
            น้องเหมียว 9 ชีวิต
          </h2>
        </div>

        <ul className="flex flex-col gap-1 rounded-2xl border border-gold/25 bg-velvet/60 p-3 text-left text-xs leading-relaxed text-cream">
          <li>• ค่าเล่น <b className="text-gold-light">{CAT_GAME_COST} เหรียญ</b> · เล่นได้ <b className="text-gold-light">วันละ 1 ครั้ง</b> (รีเซ็ตเที่ยงคืนเวลาไทย)</li>
          <li>• จิ้มน้องเหมียว 1 ตัวจาก {CAT_COUNT} ตัว (แมวส้ม 3 · ดำ 3 · ขาว 3)</li>
          <li>• ลุ้นรับ {CAT_REWARDS.map((r) => r.toLocaleString("th-TH")).join(" / ")} เหรียญ เข้ากระเป๋าหลักทันที · โอกาสออกเท่ากันระดับละ 20%</li>
        </ul>

        {mode === "low" && phase.name === "pick" ? (
          <p className="text-sm text-gold-light">
            ต้องมีเหรียญอย่างน้อย {CAT_GAME_COST} เหรียญจึงจะเริ่มเล่นได้ (ตอนนี้คุณมี {balance.toLocaleString("th-TH")} เหรียญ)
          </p>
        ) : phase.name === "pick" ? (
          <p className="text-sm text-cream">แตะน้องเหมียว 1 ตัวเพื่อรับโชค · เหรียญคงเหลือ {formatCoins(balance)}</p>
        ) : null}

        {phase.name !== "result" && (
          <div className={"mx-auto w-full max-w-[17rem] " + (mode === "low" ? "opacity-60" : "")}>
            <CatBoard
              chosenIndex={phase.name === "loading" ? phase.index : null}
              loadingIndex={phase.name === "loading" ? phase.index : null}
              disabled={locked}
              onPick={onPick}
              tileRefs={tileRefs}
            />
          </div>
        )}

        {error && <p className="text-sm text-rose-300">{error}</p>}

        {phase.name === "result" && <Result phase={phase} balance={balance} reduce={!!reduce} />}

        {mode === "low" && phase.name === "pick" && (
          <Link href="/topup" onClick={onClose} className={goldButtonClass({ className: "w-full" })}>
            เติมเหรียญเลย
          </Link>
        )}
        {!drawing && (
          <GoldButton variant={phase.name === "result" ? "solid" : "ghost"} onClick={onClose} className="w-full">
            {phase.name === "result" ? "ปิด" : "ไว้ก่อน"}
          </GoldButton>
        )}
      </div>
    </div>
  );
}

function Result({ phase, balance, reduce }: { phase: Extract<SurprisePhase, { name: "result" }>; balance: number; reduce: boolean }) {
  const won = phase.reward > 0;
  return (
    <motion.div
      role="status"
      initial={reduce ? false : { opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-gold/60 bg-velvet/80 p-4 shadow-[0_0_30px_-8px_rgb(212_175_55/0.8)]"
    >
      {won ? (
        <>
          <p className="text-xs tracking-widest text-gold/80">น้องเหมียวมอบโชคให้คุณ ✨</p>
          <motion.p
            className="font-tarot text-5xl font-bold text-gold-gradient"
            animate={reduce ? undefined : { scale: phase.reward >= 1000 ? [1, 1.25, 1, 1.15, 1] : [1, 1.15, 1] }}
            transition={{ duration: phase.reward >= 1000 ? 1.4 : 0.7 }}
          >
            +{formatCoins(phase.reward)}
          </motion.p>
          <p className="text-sm text-cream">เหรียญ เข้ากระเป๋าแล้ว (คงเหลือ {formatCoins(balance)})</p>
          <p className="text-xs text-cream-muted">{catBlessing(phase.reward)}</p>
        </>
      ) : (
        <p className="text-sm text-cream">{phase.message ?? "วันนี้คุณเล่นน้องเหมียวไปแล้วค่ะ ไม่มีการหักเหรียญเพิ่ม"}</p>
      )}
      <p className="text-xs text-gold-light">เล่นได้อีกครั้ง พรุ่งนี้ตั้งแต่ 00:00 น. (เวลาไทย) 🐾</p>
    </motion.div>
  );
}
