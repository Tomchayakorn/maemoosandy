import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogoEmblem } from "@/components/ui/LogoEmblem";
import { MusicToggle } from "@/components/audio/MusicToggle";
import { CoinBadge } from "@/components/ui/CoinBadge";
import { UserMenu } from "@/components/layout/UserMenu";
import { goldButtonClass } from "@/components/ui/GoldButton";
import { getCurrentUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getMyWallet } from "@/lib/wallet";

/**
 * Sticky header. The logo is part of the static shell; the user area reads the
 * session, so it streams in behind <Suspense> (required with cacheComponents).
 */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-velvet/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between gap-3 px-4 sm:max-w-2xl">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="แม่มูแซนดี้ บ้าน ณ มัณตรา — หน้าแรก">
          {/* 40px circle × 1.78 emblem scale ≈ 72px of source image */}
          <LogoEmblem className="size-10" sizes="72px" eager />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="whitespace-nowrap font-display text-xl">
              <span className="text-gold-gradient">แม่มูแซนดี้</span>
            </span>
            <span className="truncate font-serif text-[11px] tracking-wide text-cream-muted">
              บ้าน ณ มัณตรา
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <MusicToggle />
          <Suspense fallback={<div className="h-10 w-28 animate-pulse rounded-full bg-gold/10" />}>
            <HeaderUser />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function HeaderUser() {
  await connection();
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;

  if (!user) {
    return (
      <Link href="/login" className={goldButtonClass({ variant: "outline", className: "h-10 px-4" })}>
        เข้าสู่ระบบ
      </Link>
    );
  }

  const wallet = await getMyWallet();
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const displayName = meta?.full_name || meta?.name || user.email?.split("@")[0] || "ผู้มีบุญ";

  return (
    <div className="flex items-center gap-2">
      <CoinBadge userId={user.id} initialBalance={wallet?.balance ?? 0} />
      <UserMenu
        displayName={displayName}
        spinTickets={wallet?.spin_tickets ?? 0}
        freeReadings={wallet?.free_reading_tickets ?? 0}
      />
    </div>
  );
}
