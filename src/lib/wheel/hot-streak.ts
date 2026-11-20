/**
 * "มือขึ้น 5 ตาติด" (5-spin hot streak) — client-safe constants + a pure reference model of the rules in `spin_wheel_cycle`
 * (migration 0014). The database is the source of truth (wallet row lock); the route supplies the crypto roll.
 *
 *  - After a PAID spin, with probability 1 / HOT_TRIGGER_ONE_IN (and no streak running) a streak starts.
 *  - The NEXT HOT_STREAK_ROUNDS spins (free or paid) draw from the hot odds (80% coin prize).
 *  - Each spin of the streak counts it down; at 0 it is over. A streak cannot be re-triggered while it runs.
 *  - Reward precedence per spin: jackpot > luck-card buff > hot streak > ordinary.
 */
export const HOT_STREAK_ROUNDS = 5;
export const HOT_TRIGGER_ONE_IN = 250;

export type HotState = { rounds: number };

/** One spin. `trigger` is the route's crypto roll (true with probability 1 / HOT_TRIGGER_ONE_IN). */
export function afterSpinHot(s: HotState, o: { paid: boolean; trigger: boolean }): { state: HotState; applied: boolean; started: boolean } {
  const applied = s.rounds > 0;
  const started = s.rounds === 0 && o.paid && o.trigger;
  return {
    applied,
    started,
    state: { rounds: applied ? s.rounds - 1 : started ? HOT_STREAK_ROUNDS : 0 },
  };
}
