"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { celebrateCatReward } from "@/components/cat-game/celebrate";
import { playCatGame } from "@/lib/cat-game/client";
import { CAT_GAME_COST } from "@/lib/cat-game/config";
import { dismissSurprise, isSurpriseDismissed, popupVisible, subscribeSurprise, surpriseDismissKey, SURPRISE_GRACE_MS, surpriseToShow } from "@/lib/cat-game/surprise";
import { hasSurpriseBlock, subscribeSurpriseBlock } from "@/lib/cat-game/surprise-block";
import { walletBus } from "@/lib/wallet-bus";
import { CatSurprise, type SurprisePhase } from "./CatSurprise";

function subscribeBlocked(cb: () => void): () => void {
  const offBlocks = subscribeSurpriseBlock(cb);
  const offBus = walletBus.subscribe(cb); // a hold starts/ends with every spin / round
  return () => {
    offBlocks();
    offBus();
  };
}
const isBlocked = () => hasSurpriseBlock() || walletBus.isHeld();

/**
 * Live, playable cat-game surprise. The server tells us the player, the balance and whether today's chance is used; from there:
 *  - the balance is followed live (walletBus), so the pop-up appears when it falls into 0..50 without a refresh;
 *  - it waits while anything else is on screen (rules pop-up, a spin / round, a result) and for a short grace delay;
 *  - a tap plays the round right here (POST /api/cat-game/play: the server charges 9, draws and credits atomically), shows the reward,
 *    updates the header badge at once (walletBus) and refreshes the page so every balance on it follows;
 *  - closing it without playing is remembered per user + state + day + balance in sessionStorage.
 */
export function CatSurpriseLive({ userId, bangkokDay, initialBalance, playedToday }: { userId: string; bangkokDay: string; initialBalance: number; playedToday: boolean }) {
  const router = useRouter();
  const [balance, setBalance] = useState(initialBalance);
  const [prevInitial, setPrevInitial] = useState(initialBalance);
  if (prevInitial !== initialBalance) {
    // the server sent a fresh balance (after router.refresh()): follow it without remounting, so a result on screen is not lost
    setPrevInitial(initialBalance);
    setBalance(initialBalance);
  }
  const [playedHere, setPlayedHere] = useState(false);
  const [phase, setPhase] = useState<SurprisePhase>({ name: "pick" });
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // follow the settled balance the games publish (release/set); ignore the optimistic values sent while a hold is active
  useEffect(
    () =>
      walletBus.subscribe((d) => {
        if (!d.hold && typeof d.balance === "number") setBalance(d.balance);
      }),
    [],
  );

  const played = playedToday || playedHere;
  const blocked = useSyncExternalStore(subscribeBlocked, isBlocked, () => true); // server: blocked → never in the HTML
  const state = surpriseToShow(balance, played, blocked);

  const dismissKey = surpriseDismissKey(userId, state ?? "offer", bangkokDay, balance);
  const dismissed = useSyncExternalStore(subscribeSurprise, () => isSurpriseDismissed(dismissKey), () => true);

  // short grace period once the screen is free, so the player first sees the result; keyed by state+balance so each new balance gets its own
  const wantKey = state ? `${state}:${balance}` : null;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!wantKey) return;
    const t = setTimeout(() => setReadyKey(wantKey), SURPRISE_GRACE_MS);
    return () => clearTimeout(t);
  }, [wantKey]);

  const visible = popupVisible({
    playing: phase.name === "loading",
    hasResult: phase.name === "result",
    state,
    blocked,
    graceReady: readyKey === wantKey,
    dismissed,
  });

  const close = useCallback(() => {
    if (busy.current) return;
    if (phase.name === "result") {
      setPhase({ name: "pick" });
      setError(null);
      return;
    }
    dismissSurprise(dismissKey);
  }, [phase.name, dismissKey]);

  async function pick(index: number) {
    if (busy.current || phase.name !== "pick" || state !== "offer") return;
    busy.current = true;
    setError(null);
    const before = balance;
    setPhase({ name: "loading", index });
    setBalance(before - CAT_GAME_COST);
    walletBus.hold(before - CAT_GAME_COST); // header badge: optimistic -9
    const out = await playCatGame(index);
    if (!out.ok) {
      setBalance(before);
      walletBus.release(before);
      busy.current = false;
      if (out.alreadyPlayed) {
        setPlayedHere(true);
        setPhase({ name: "result", index, reward: 0, message: out.message });
      } else {
        setPhase({ name: "pick" });
        setError(out.message);
      }
      router.refresh();
      return;
    }
    setBalance(out.balance);
    walletBus.release(out.balance); // header badge shows the final balance immediately
    setPlayedHere(true);
    setPhase({ name: "result", index, reward: out.reward });
    busy.current = false;
    celebrateCatReward(out.reward, tileRefs.current[index]);
    router.refresh(); // the page's own balance (lucky card / wheel / home) follows
  }

  if (!visible) return null;
  const mode = state ?? "offer";
  return <CatSurprise mode={mode} balance={balance} phase={phase} error={error} onPick={pick} onClose={close} tileRefs={tileRefs} />;
}
