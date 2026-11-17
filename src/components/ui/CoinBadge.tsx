"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { walletBus } from "@/lib/wallet-bus";
import { CoinIcon, PlusIcon } from "@/components/ui/icons";

type Props = { userId: string; initialBalance: number };

/**
 * Coin balance pill in the header. Starts from the server-rendered balance and
 * stays live via Supabase Realtime on the user's own `wallets` row (RLS-scoped).
 */
export function CoinBadge({ userId, initialBalance }: Props) {
  const [balance, setBalance] = useState(initialBalance);
  const [pulse, setPulse] = useState(0);
  const balanceRef = useRef(initialBalance);
  const reduce = useReducedMotion();

  const spring = useSpring(initialBalance, { stiffness: 90, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString("th-TH"));

  useEffect(() => {
    if (reduce) spring.jump(balance);
    else spring.set(balance);
  }, [balance, reduce, spring]);

  // A server refresh (router.refresh after a spin / top-up) hands us a fresh balance too.
  useEffect(() => {
    if (walletBus.isHeld()) return; // mid-spin: don't reveal the prize early
    if (initialBalance !== balanceRef.current) {
      if (initialBalance > balanceRef.current) setPulse((p) => p + 1);
      balanceRef.current = initialBalance;
      setBalance(initialBalance);
    }
  }, [initialBalance]);

  // Instant updates pushed by pages (optimistic spin cost, revealed prize).
  useEffect(
    () =>
      walletBus.subscribe(({ balance: next }) => {
        if (typeof next !== "number") return;
        if (next > balanceRef.current) setPulse((p) => p + 1);
        balanceRef.current = next;
        setBalance(next);
      }),
    [],
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Join Realtime with the user's access token. If the channel joins before the session
      // has loaded it would use the anon key, and RLS would hide the wallet row (no events).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`wallet:${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
          (payload) => {
            const next = (payload.new as { balance?: number }).balance;
            if (typeof next === "number" && !walletBus.isHeld()) {
              if (next > balanceRef.current) setPulse((p) => p + 1);
              balanceRef.current = next;
              setBalance(next);
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      href="/topup"
      aria-label={`เหรียญคงเหลือ ${balance.toLocaleString("th-TH")} เหรียญ — เติมเหรียญ`}
      className="group relative flex h-10 items-center gap-1.5 rounded-full border border-gold/50 bg-velvet/80 pl-1.5 pr-1 text-sm font-semibold text-gold-light shadow-[0_0_16px_-4px_rgb(212_175_55/0.5)] transition hover:border-gold"
    >
      <motion.span
        key={pulse}
        initial={pulse && !reduce ? { scale: 1.5, rotate: -20 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 14 }}
        className="flex"
      >
        <CoinIcon className="size-7" />
      </motion.span>
      <motion.span className="min-w-[2ch] tabular-nums">{display}</motion.span>
      <span className="flex size-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--gold-light),var(--gold))] text-velvet transition group-hover:brightness-110">
        <PlusIcon className="size-4" />
      </span>
    </Link>
  );
}
