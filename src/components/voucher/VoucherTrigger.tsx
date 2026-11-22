"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { goldCelebration } from "@/components/fx/confetti";
import { GoldButton } from "@/components/ui/GoldButton";
import { useSurpriseBlock } from "@/lib/cat-game/surprise-block";
import { formatCoins } from "@/lib/pricing";
import { isValidVoucherCode, normalizeVoucherCode } from "@/lib/voucher";
import { walletBus } from "@/lib/wallet-bus";

type Result = { kind: "success"; coins: number; balance: number } | { kind: "error"; message: string; needLogin?: boolean };

/**
 * "กรอกโค้ดลับจากแม่มู": a trigger (compact card for the home page, or a small inline button for the wallet / top-up area) that opens the
 * same code modal. The server does every check (POST /api/voucher/redeem → redeem_voucher); this only normalises the text and shows the result.
 */
export function VoucherTrigger({ variant = "card" }: { variant?: "card" | "inline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "card" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-gold/50 bg-[linear-gradient(135deg,rgb(212_175_55/0.16),rgb(18_26_51/0.9))] px-4 py-2 text-left shadow-[0_0_20px_-8px_rgb(212_175_55/0.7)] transition hover:border-gold-light active:scale-[0.99]"
        >
          <span aria-hidden className="text-2xl">🎁</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-serif text-sm font-semibold text-gold-light">กรอกโค้ดลับจากแม่มู</span>
            <span className="truncate text-xs text-cream-muted">รับเหรียญฟรีจากโค้ดที่แจกในไลฟ์สด</span>
          </span>
          <span aria-hidden className="text-gold">›</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto inline-flex h-10 items-center gap-1.5 rounded-full border border-gold/50 px-4 text-sm text-gold-light transition hover:bg-gold/10"
        >
          <span aria-hidden>🎁</span> มีโค้ดลับจากแม่มู? กรอกที่นี่
        </button>
      )}
      {open && <VoucherModal onClose={() => setOpen(false)} />}
    </>
  );
}

function VoucherModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false); // blocks a double tap before React has re-rendered the disabled button
  const done = result?.kind === "success";

  useSurpriseBlock(true); // the cat-game surprise waits while this is open

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || done || inFlight.current) return;
    const normalized = normalizeVoucherCode(code);
    if (!normalized) return setResult({ kind: "error", message: "กรอกโค้ดก่อนนะคะ" });
    if (!isValidVoucherCode(normalized)) return setResult({ kind: "error", message: "โค้ดไม่ถูกต้องค่ะ ตรวจตัวอักษรอีกครั้งนะคะ" });
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/voucher/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: normalized }) });
      const json = (await res.json().catch(() => null)) as { coins?: number; balance?: number; error?: { code?: string; message?: string } } | null;
      if (res.ok && json && typeof json.coins === "number" && typeof json.balance === "number") {
        setResult({ kind: "success", coins: json.coins, balance: json.balance });
        goldCelebration();
        walletBus.set(json.balance); // header badge (and any open pop-up) shows the new balance at once
        router.refresh(); // the page's own balance follows
      } else {
        setResult({ kind: "error", message: json?.error?.message ?? "ใช้โค้ดไม่สำเร็จ ลองใหม่อีกครั้งนะคะ", needLogin: res.status === 401 });
      }
    } catch {
      setResult({ kind: "error", message: "เชื่อมต่อไม่ได้ กรุณาลองใหม่อีกครั้งค่ะ" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    // items-start on phones: the input and button sit in the upper part, so the on-screen keyboard does not cover them;
    // z-[65] is above the floating LINE button (z-50) and the cat-game pop-up (z-60)
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-velvet/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,8dvh)] backdrop-blur-sm sm:items-center sm:pt-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voucher-title"
        className="flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-gold/60 bg-midnight p-5 text-center shadow-[0_0_40px_-8px_rgb(212_175_55/0.7)]"
      >
        <p className="font-serif text-xs tracking-[0.25em] text-gold/90">✦ ของขวัญจากแม่มู ✦</p>
        <h2 id="voucher-title" className="font-display text-3xl text-gold-gradient">
          กรอกโค้ดลับ
        </h2>
        <p className="text-xs leading-relaxed text-cream-muted">รับโค้ดได้จากการไลฟ์สดของแม่มู · 1 บัญชีใช้ได้ 1 ครั้งต่อ 1 โค้ด · โค้ดมีวันหมดอายุและจำนวนสิทธิ์จำกัด</p>

        <input
          ref={inputRef}
          value={code}
          onChange={(e) => {
            setCode(normalizeVoucherCode(e.target.value)); // upper-case, no spaces, as you type
            if (result?.kind === "error") setResult(null);
          }}
          disabled={busy || done}
          maxLength={40}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="โค้ดลับ"
          aria-invalid={result?.kind === "error"}
          placeholder="พิมพ์โค้ดที่นี่"
          className="h-14 w-full rounded-xl border border-gold/50 bg-velvet px-4 text-center font-tarot text-xl uppercase tracking-[0.2em] text-cream outline-none placeholder:font-sans placeholder:text-sm placeholder:normal-case placeholder:tracking-normal placeholder:text-cream-muted/60 focus:border-gold-light disabled:opacity-60"
        />

        {result?.kind === "error" && (
          <div role="alert" className="text-sm text-rose-300">
            <p>{result.message}</p>
            {result.needLogin && (
              <Link href={`/login?next=${encodeURIComponent(pathname || "/")}`} className="mt-1 inline-block text-gold-light underline">
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        )}
        {result?.kind === "success" && (
          <div role="status" className="flex flex-col items-center gap-0.5 rounded-2xl border border-gold/60 bg-velvet/80 p-3">
            <p className="text-xs tracking-widest text-gold/80">รับเหรียญสำเร็จ ✨</p>
            <p className="font-tarot text-4xl font-bold text-gold-gradient">+{formatCoins(result.coins)}</p>
            <p className="text-sm text-cream">เหรียญ เข้ากระเป๋าแล้ว (คงเหลือ {formatCoins(result.balance)})</p>
          </div>
        )}

        {!done && (
          <GoldButton type="submit" disabled={busy || !code} className="w-full">
            {busy ? "กำลังตรวจโค้ด…" : "รับสิทธิ์"}
          </GoldButton>
        )}
        <GoldButton type="button" variant={done ? "solid" : "ghost"} onClick={onClose} disabled={busy} className="w-full">
          {done ? "ปิด" : "ยกเลิก"}
        </GoldButton>
      </form>
    </div>
  );
}
