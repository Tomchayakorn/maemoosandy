"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "กลับหน้าหลัก" button, shown on every page except the home page (rendered once in the root layout, under the header).
 * A plain navigation link: it never calls an API, so a round that is still open (Mystic Chests, Power Wheel) stays on the server and the
 * wallet is untouched. Own row (44px tall) under the sticky header, so it never crowds the logo, the coin badge or the floating LINE button.
 */
export function BackHome() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <nav aria-label="กลับหน้าหลัก" className="mx-auto w-full max-w-md px-4 pt-3 sm:max-w-2xl">
      <Link
        href="/"
        data-testid="back-home"
        className="inline-flex h-11 items-center gap-1.5 rounded-full border border-gold/40 bg-velvet/70 pl-3.5 pr-4 text-sm text-gold-light transition hover:border-gold hover:bg-gold/10 active:scale-[0.98]"
      >
        <span aria-hidden className="text-base leading-none">←</span>
        กลับหน้าหลัก
      </Link>
    </nav>
  );
}
