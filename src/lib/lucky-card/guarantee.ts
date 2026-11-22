/**
 * Client-safe copy of the guarantee numbers, for the countdown and the rules pop-up (display only).
 * The real rule is applied by the database (migration 0015) from GUARANTEE_* in src/lib/lucky-card-config.ts (server-only);
 * a unit test keeps the two in sync.
 */
export const GUARANTEE_DRY_ROUNDS = 10;
export const GUARANTEE_DRY_COINS = 15;
export const GUARANTEE_EVERY_ROUNDS = 25;
export const GUARANTEE_EVERY_COINS = 40;
