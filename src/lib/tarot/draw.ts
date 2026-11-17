import "server-only";

import { randomInt } from "node:crypto";
import { DECK, POSITIONS, type DrawnCardView } from "./deck";

const REVERSED_PERCENT = 30;

/** Draw three distinct cards (past / present / future) with cryptographic randomness. */
export function drawThree(): DrawnCardView[] {
  const pool = [...DECK];
  // Partial Fisher–Yates: only the first three slots are needed.
  for (let i = 0; i < 3; i++) {
    const j = randomInt(i, pool.length);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return POSITIONS.map((position, i) => {
    const { reversed: reversedMeaning, ...card } = pool[i];
    const isReversed = randomInt(100) < REVERSED_PERCENT;
    return {
      ...card,
      isReversed,
      position,
      meaning: isReversed ? reversedMeaning : card.upright,
    };
  });
}
