import "server-only";
import { randomInt } from "node:crypto";
import { BONUS_ROLLS, SLICES } from "./config";

/** The slice one spin lands on: uniform over the 10 slices (crypto). Whether it is safe is decided by the database from the level. */
export function drawSlice(rand: (maxExclusive: number) => number = (n) => randomInt(n)): number {
  return rand(SLICES);
}

/** The bonus roll sent with every spin of a bonus round (crypto). The database uses it only when that spin unlocks the bonus. */
export function drawBonusRoll(rand: (maxExclusive: number) => number = (n) => randomInt(n)): number {
  return rand(BONUS_ROLLS);
}
