import "server-only";
import { randomInt } from "node:crypto";
import { CAT_REWARDS, type CatReward } from "./config";

/** Draw one reward with crypto randomness: every level has exactly the same chance (1/5). Server side only. */
export function drawCatReward(rand: (maxExclusive: number) => number = (n) => randomInt(n)): CatReward {
  return CAT_REWARDS[rand(CAT_REWARDS.length)];
}
