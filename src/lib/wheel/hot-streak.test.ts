import { describe, expect, it } from "vitest";
import { afterSpinHot, HOT_STREAK_ROUNDS, HOT_TRIGGER_ONE_IN } from "./hot-streak";

const run = (rounds: number, paid: boolean, trigger: boolean) => afterSpinHot({ rounds }, { paid, trigger });

describe("hot streak state machine (model of spin_wheel_cycle, migration 0014)", () => {
  it("constants: 5 spins, about 1 in 250", () => {
    expect(HOT_STREAK_ROUNDS).toBe(5);
    expect(HOT_TRIGGER_ONE_IN).toBe(250);
  });

  it("a paid spin with a winning roll starts a 5-spin streak (it affects the NEXT spins, not this one)", () => {
    const r = run(0, true, true);
    expect(r).toEqual({ state: { rounds: 5 }, applied: false, started: true });
  });

  it("free-ticket spins never start a streak", () => {
    expect(run(0, false, true)).toEqual({ state: { rounds: 0 }, applied: false, started: false });
  });

  it("no roll, no streak", () => {
    expect(run(0, true, false)).toEqual({ state: { rounds: 0 }, applied: false, started: false });
  });

  it("the next 5 spins are hot and count down 5 -> 4 -> 3 -> 2 -> 1 -> 0, then it is over", () => {
    let s = run(0, true, true).state; // streak armed
    const applied: boolean[] = [];
    const left: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = afterSpinHot(s, { paid: true, trigger: false });
      applied.push(r.applied);
      s = r.state;
      left.push(s.rounds);
    }
    expect(applied).toEqual([true, true, true, true, true, false, false]); // exactly 5 hot spins
    expect(left).toEqual([4, 3, 2, 1, 0, 0, 0]);
  });

  it("a roll during a running streak is ignored (no extension, no stacking)", () => {
    const r = run(3, true, true);
    expect(r.started).toBe(false);
    expect(r.state.rounds).toBe(2);
  });

  it("free spins inside a streak are hot too and use up a round", () => {
    expect(run(2, false, false)).toEqual({ state: { rounds: 1 }, applied: true, started: false });
  });

  it("after a streak ends a new one can start on the next paid spin", () => {
    const last = run(1, true, true); // the last hot spin: ignores the roll
    expect(last.state.rounds).toBe(0);
    expect(run(last.state.rounds, true, true).started).toBe(true);
  });
});
