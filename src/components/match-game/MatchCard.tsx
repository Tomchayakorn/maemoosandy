"use client";

import Image from "next/image";
import { useState } from "react";
import { SYMBOLS } from "@/lib/match-game/config";
import { SymbolArt } from "./symbols";

/** The back of every card (identical for all, so it says nothing about the card): a 1040×1040 picture of a card on a transparent ground. */
const BACK_IMAGE = "/images/card-back-mae-moo-sandy.png";

export type CardState = "hidden" | "pending" | "open" | "matched" | "missed" | "revealed";

const FACE: Record<CardState, string> = {
  hidden: "border-gold/40",
  pending: "border-gold/40",
  open: "border-gold-light shadow-[0_0_18px_-4px_rgb(243_217_139/0.9)]",
  matched: "border-emerald-300/80 shadow-[0_0_20px_-4px_rgb(110_231_183/0.85)]",
  missed: "border-rose-400/80",
  revealed: "border-gold/30",
};

/**
 * One card. It only draws what it is told: `symbol` is null until the server has shown it. The last symbol is remembered so the picture stays
 * on the card while it turns back over. Reduced motion: the card changes face without turning.
 */
export function MatchCard({
  position,
  symbol,
  state,
  disabled,
  fresh = false,
  onFlip,
}: {
  position: number;
  symbol: number | null;
  state: CardState;
  disabled: boolean;
  /** this card has just been matched: a ring of light spreads from it once */
  fresh?: boolean;
  onFlip: (position: number) => void;
}) {
  const [shown, setShown] = useState<number | null>(symbol);
  if (symbol !== null && symbol !== shown) setShown(symbol);
  const up = symbol !== null;
  const label = `ไพ่ใบที่ ${position + 1}` + (up ? ` ${SYMBOLS[symbol]}` : " คว่ำอยู่") + (state === "matched" ? " จับคู่แล้ว" : "");

  return (
    <button
      type="button"
      data-testid={`match-card-${position}`}
      data-state={state}
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onFlip(position);
      }}
      className={
        "perspective-1000 relative aspect-square w-full touch-manipulation select-none rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-gold-light sm:aspect-[4/5] " +
        (disabled ? "cursor-default" : "cursor-pointer active:scale-95")
      }
    >
      <span className={"preserve-3d absolute inset-0 block transition-transform duration-[420ms] ease-out motion-reduce:transition-none " + (up ? "[transform:rotateY(180deg)]" : "")}>
        <span
          className={
            "backface-hidden absolute inset-0 rounded-2xl border bg-[linear-gradient(155deg,#3a2268,#160f2e_70%)] " +
            (state === "pending" ? "animate-pulse border-gold-light" : "border-gold/55")
          }
        >
          {/* Edge to edge: the picture (a card lying about 4° clockwise on a transparent ground) is turned upright and enlarged until only the
              card's own artwork is inside the frame, never stretched. The square phone frame shows the face and the name; the taller wide-screen
              frame shows the whole inside of the card, both lines of lettering included. The numbers are tuned to this file.
              (clip-path as well as overflow: WebKit does not always round-clip an enlarged picture inside a 3D flip.) */}
          <span className="absolute inset-0 overflow-hidden rounded-[15px] [clip-path:inset(0_round_15px)]">
            <Image
              src={BACK_IMAGE}
              alt=""
              fill
              sizes="(min-width: 640px) 150px, 50vw"
              loading="eager"
              draggable={false}
              className="pointer-events-none -rotate-4 scale-[1.53] object-cover sm:scale-[1.24]"
            />
          </span>
        </span>
        <span className={"backface-hidden absolute inset-0 flex items-center justify-center rounded-2xl border-2 bg-[linear-gradient(160deg,#241a45,#100c22)] [transform:rotateY(180deg)] " + FACE[state]}>
          {shown !== null && <SymbolArt symbol={shown} className={"size-[76%] " + (state === "revealed" ? "opacity-45 grayscale-[0.4]" : "")} />}
          {state === "matched" && (
            <span aria-hidden className="absolute right-1 top-0.5 text-xs text-emerald-300">
              ✓
            </span>
          )}
        </span>
      </span>
      {fresh && <span aria-hidden className="match-ring" />}
    </button>
  );
}
