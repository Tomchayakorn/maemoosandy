import { randomInt } from "node:crypto";
import { CARDS } from "./config";

/** A fresh layout: each of the six symbols twice, shuffled with crypto (Fisher-Yates). Server only — the browser never receives it. */
export function dealLayout(random: (max: number) => number = (max) => randomInt(max)): number[] {
  const cards = Array.from({ length: CARDS }, (_, i) => Math.floor(i / 2));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
