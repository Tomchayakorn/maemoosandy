"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { signOutAction } from "@/app/login/actions";

/** Avatar button with a small dropdown (wallet summary + sign out). */
export function UserMenu({
  displayName,
  spinTickets,
  freeReadings,
}: {
  displayName: string;
  spinTickets: number;
  freeReadings: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = displayName.trim().charAt(0).toUpperCase() || "✦";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูบัญชี"
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full border border-gold/50 bg-midnight font-serif text-base text-gold-light transition hover:border-gold"
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="border-gold-frame absolute right-0 top-12 z-[60] w-60 origin-top-right rounded-2xl border border-gold bg-[#0B1021] p-2 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.9)] backdrop-blur-xl"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm text-cream">สวัสดีค่ะ คุณ{displayName}</p>
              <p className="mt-1 text-xs text-cream-muted">
                สิทธิ์หมุนกงล้อ {spinTickets} ครั้ง
                {freeReadings > 0 ? ` · ดูดวงฟรี ${freeReadings} ครั้ง` : ""}
              </p>
            </div>
            <div className="my-1 h-px bg-gold/15" />
            <Link
              role="menuitem"
              href="/topup"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm text-cream hover:bg-gold/10"
            >
              เติมเหรียญ
            </Link>
            <Link
              role="menuitem"
              href="/lucky-wheel"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm text-cream hover:bg-gold/10"
            >
              กงล้อมหาเฮง
            </Link>
            <Link
              role="menuitem"
              href="/history"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm text-cream hover:bg-gold/10"
            >
              ประวัติของฉัน
            </Link>
            <Link
              role="menuitem"
              href="/withdraw"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm text-cream hover:bg-gold/10"
            >
              ถอนรางวัลแจ็กพอต
            </Link>
            <form action={signOutAction}>
              <button
                role="menuitem"
                type="submit"
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-cream-muted hover:bg-ruby/15 hover:text-cream"
              >
                ออกจากระบบ
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
