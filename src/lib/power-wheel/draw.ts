import "server-only";
import { randomInt } from "node:crypto";
import { SLICES } from "./config";

/** The slice one spin lands on: uniform over the 10 slices (crypto). Whether it is safe is decided by the database from the level. */
export function drawSlice(rand: (maxExclusive: number) => number = (n) => randomInt(n)): number {
  return rand(SLICES);
}
