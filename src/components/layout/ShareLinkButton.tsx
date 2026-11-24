"use client";

import { useEffect, useRef, useState } from "react";
import { mainShareUrl, SHARE_TEXT, SHARE_TITLE } from "@/lib/share-link";

type Status = { tone: "ok" | "info" | "warn"; text: string } | null;

/**
 * "แชร์เว็บ" — shares the site's MAIN link (never the page the player is on). Pure browser UI: no API call, nothing about a running game round,
 * the wallet or the database is touched.
 *  - แชร์: Web Share API (navigator.share) when the browser has it; a cancelled share stays quiet
 *  - คัดลอกลิงก์: Clipboard API, with a select-and-copy fallback and a "copy it by hand" hint if both are blocked
 *  - เปิดในเบราว์เซอร์: opens the main link in a new tab
 * When the browser / in-app WebView cannot share directly, the panel says so instead of failing silently.
 */
export function ShareLinkButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  function toggle() {
    if (!open) {
      const link = mainShareUrl(process.env.NEXT_PUBLIC_APP_URL, window.location.origin);
      setUrl(link);
      const can = typeof navigator.share === "function";
      setCanShare(can);
      setStatus(can ? null : { tone: "info", text: "เบราว์เซอร์นี้ไม่รองรับการแชร์โดยตรง ใช้ปุ่มคัดลอกลิงก์หรือเปิดในเบราว์เซอร์แทนได้ค่ะ" });
    }
    setOpen((o) => !o);
  }

  // close on outside tap / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
      setStatus({ tone: "ok", text: "ส่งต่อลิงก์เรียบร้อยแล้วค่ะ ✨" });
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return; // the player closed the share sheet
      setStatus({ tone: "warn", text: "แชร์โดยตรงไม่สำเร็จ ลองกดคัดลอกลิงก์แทนได้ค่ะ" });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ tone: "ok", text: "คัดลอกลิงก์แล้ว นำไปวางส่งต่อได้เลยค่ะ ✓" });
      return;
    } catch {
      /* blocked or unsupported: try the old way */
    }
    const el = input.current;
    if (el) {
      el.focus();
      el.select();
      el.setSelectionRange(0, url.length);
      try {
        if (document.execCommand("copy")) {
          setStatus({ tone: "ok", text: "คัดลอกลิงก์แล้ว นำไปวางส่งต่อได้เลยค่ะ ✓" });
          return;
        }
      } catch {
        /* fall through to the manual hint */
      }
    }
    setStatus({ tone: "warn", text: "คัดลอกอัตโนมัติไม่ได้ ลิงก์ถูกเลือกไว้แล้ว กดค้างที่ลิงก์แล้วเลือกคัดลอกได้เลยค่ะ" });
  }

  const tone = status?.tone === "ok" ? "text-emerald-300" : status?.tone === "warn" ? "text-rose-300" : "text-cream-muted";
  const btn = "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gold/40 px-3 text-sm text-gold-light transition hover:border-gold hover:bg-gold/10 active:scale-[0.98]";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-testid="share-toggle"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-gold/40 bg-velvet/70 pl-3.5 pr-4 text-sm text-gold-light transition hover:border-gold hover:bg-gold/10 active:scale-[0.98]"
      >
        <span aria-hidden className="text-base leading-none">🔗</span>
        แชร์เว็บ
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="แชร์ลิงก์หลักของเว็บ"
          data-testid="share-panel"
          className="absolute right-0 top-full z-30 mt-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2.5 rounded-2xl border border-gold/50 bg-velvet p-3.5 text-left shadow-[0_8px_24px_-8px_rgb(0_0_0/0.8)]"
        >
          <p className="text-sm text-cream">แชร์ลิงก์หลักของแม่มูแซนดี้</p>
          <input
            ref={input}
            readOnly
            value={url}
            aria-label="ลิงก์หลักของเว็บ"
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 w-full rounded-xl border border-gold/30 bg-midnight/70 px-3 text-sm text-cream focus:border-gold focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            {canShare && (
              <button type="button" onClick={share} className={btn + " col-span-2 border-gold bg-gold/15 font-semibold"} data-testid="share-native">
                แชร์
              </button>
            )}
            <button type="button" onClick={copy} className={btn} data-testid="share-copy">
              คัดลอกลิงก์
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className={btn} data-testid="share-open">
              เปิดในเบราว์เซอร์
            </a>
          </div>
          {status && (
            <p role="status" aria-live="polite" className={"text-xs leading-relaxed " + tone}>
              {status.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
