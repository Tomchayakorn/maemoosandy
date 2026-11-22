"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { hasSurpriseBlock, subscribeSurpriseBlock } from "@/lib/cat-game/surprise-block";
import { surpriseToShow } from "@/lib/cat-game/surprise";
import { walletBus } from "@/lib/wallet-bus";
import { CatSurprise } from "./CatSurprise";

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
 * Live version of the cat-game surprise. The server only tells us the player and whether today's chance is unused; the balance
 * is followed here, so the pop-up appears the moment the balance falls into 0..50 (e.g. after a round leaves 40 coins) without a refresh.
 * It stays hidden while anything else is on screen (rules pop-up, a spin / round in progress, a result) and shows once that is gone.
 */
function Inner({ userId, bangkokDay, initialBalance }: { userId: string; bangkokDay: string; initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  // follow the settled balance the games publish (release/set); ignore the optimistic values sent while a hold is active
  useEffect(
    () =>
      walletBus.subscribe((d) => {
        if (!d.hold && typeof d.balance === "number") setBalance(d.balance);
      }),
    [],
  );
  const blocked = useSyncExternalStore(subscribeBlocked, isBlocked, () => true); // server: blocked → never in the HTML
  const state = surpriseToShow(balance, false, blocked);
  if (!state) return null;
  return <CatSurprise userId={userId} state={state} bangkokDay={bangkokDay} balance={balance} />;
}

/** Re-mounts when the server sends a fresh balance (after router.refresh()), so it never keeps a stale value. */
export function CatSurpriseLive(props: { userId: string; bangkokDay: string; initialBalance: number }) {
  return <Inner key={props.initialBalance} {...props} />;
}
