"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShareLinkButton } from "./ShareLinkButton";

/**
 * Row under the header on every page: "← กลับหน้าหลัก" on the left (hidden on the home page) and "🔗 แชร์เว็บ" on the right.
 * Both are plain browser UI: the back button is a navigation link and the share button never calls an API, so a round that is still open
 * (Mystic Chests, Power Wheel), the wallet and the database are untouched. The row sits in the normal flow (44px tall) so it never covers
 * the logo, the coin badge or the floating LINE button.
 */
export function PageToolbar() {
  const pathname = usePathname();
  const home = pathname === "/";
  return (
    <nav aria-label="เมนูลัด" className={"mx-auto flex w-full max-w-md items-center gap-2 px-4 pt-3 sm:max-w-2xl " + (home ? "justify-end" : "justify-between")}>
      {!home && (
        <Link
          href="/"
          data-testid="back-home"
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-gold/40 bg-velvet/70 pl-3.5 pr-4 text-sm text-gold-light transition hover:border-gold hover:bg-gold/10 active:scale-[0.98]"
        >
          <span aria-hidden className="text-base leading-none">←</span>
          กลับหน้าหลัก
        </Link>
      )}
      <ShareLinkButton />
    </nav>
  );
}
