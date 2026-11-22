import "server-only";
import { randomInt } from "node:crypto";
import { TILES } from "./config";

/** Places `mines` cursed chests with crypto randomness (partial Fisher–Yates) and returns them as a 9-bit mask. Server side only. */
export function drawMineMask(mines: number, rand: (maxExclusive: number) => number = (n) => randomInt(n)): number {
  const tiles = Array.from({ length: TILES }, (_, i) => i);
  let mask = 0;
  for (let i = 0; i < mines; i++) {
    const j = i + rand(TILES - i);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    mask |= 1 << tiles[i];
  }
  return mask;
}
