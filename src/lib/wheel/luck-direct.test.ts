import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { addWheelCash, applyLuckAfterSpin, readLuck } from "./luck-direct";

type Row = Record<string, unknown>;

/** Tiny in-memory stand-in for the supabase-js builder (select / update + eq filters). `onRead` lets a test change the row between read and update. */
function fakeAdmin(wallet: Row, opts: { onRead?: (w: Row, n: number) => void } = {}) {
  const w: Row = { user_id: "u1", ...wallet };
  let reads = 0;
  function builder() {
    let op: "select" | "update" = "select";
    let patch: Row = {};
    const filters: ((r: Row) => boolean)[] = [];
    const b = {
      select() { return b; },
      update(p: Row) { op = "update"; patch = p; return b; },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return b; },
      async maybeSingle() {
        reads++;
        const snapshot = { ...w };
        opts.onRead?.(w, reads); // a concurrent writer may change the row right after we read it
        return { data: Object.keys(snapshot).includes("luck_cards") || Object.keys(snapshot).includes("wheel_cash_total") ? snapshot : { user_id: "u1", balance: 1 }, error: null };
      },
      then(resolve: (v: unknown) => void) {
        const hit = filters.every((f) => f(w));
        if (op === "update" && hit) Object.assign(w, patch);
        resolve({ data: op === "update" ? (hit ? [{ ...w }] : []) : [{ ...w }], error: null });
      },
    };
    return b;
  }
  return { admin: { from: () => builder() } as never, wallet: w };
}

describe("luck state in the no-RPC fallback", () => {
  it("reads the snapshot, or null when the luck columns don't exist (migration 0010 missing)", async () => {
    expect(await readLuck(fakeAdmin({ luck_cards: 2, luck_buff_rounds: 3 }).admin, "u1")).toEqual({ cards: 2, buff: 3 });
    expect(await readLuck(fakeAdmin({ balance: 5 }).admin, "u1")).toBeNull();
  });

  it("counts the buff down 3 -> 2 -> 1 -> 0 and then stays at 0", async () => {
    const { admin, wallet } = fakeAdmin({ luck_cards: 0, luck_buff_rounds: 3 });
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await applyLuckAfterSpin(admin, "u1", false);
      seen.push(r!.buff);
    }
    expect(seen).toEqual([2, 1, 0, 0, 0]);
    expect(wallet.luck_buff_rounds).toBe(0);
  });

  it("adds a won card and uses a buff round in the same step", async () => {
    const { admin } = fakeAdmin({ luck_cards: 1, luck_buff_rounds: 1 });
    expect(await applyLuckAfterSpin(admin, "u1", true)).toEqual({ cards: 2, buff: 0 });
  });

  it("a card is kept even with no buff running", async () => {
    const { admin } = fakeAdmin({ luck_cards: 0, luck_buff_rounds: 0 });
    expect(await applyLuckAfterSpin(admin, "u1", true)).toEqual({ cards: 1, buff: 0 });
  });

  it("retries when the wallet changed between the read and the update (compare-and-swap)", async () => {
    const { admin, wallet } = fakeAdmin(
      { luck_cards: 0, luck_buff_rounds: 3 },
      { onRead: (w, n) => { if (n === 1) w.luck_cards = 1; } }, // someone adds a card right after our first read
    );
    const r = await applyLuckAfterSpin(admin, "u1", false);
    expect(r).toEqual({ cards: 1, buff: 2 }); // the concurrent card was NOT overwritten
    expect(wallet.luck_cards).toBe(1);
  });

  it("returns null instead of throwing when the columns are missing", async () => {
    expect(await applyLuckAfterSpin(fakeAdmin({ balance: 5 }).admin, "u1", true)).toBeNull();
  });
});

describe("cash tally in the no-RPC fallback", () => {
  it("adds the credit with compare-and-swap and returns the new total", async () => {
    const { admin, wallet } = fakeAdmin({ wheel_cash_total: 100 });
    expect(await addWheelCash(admin, "u1", 30)).toBe(130);
    expect(wallet.wheel_cash_total).toBe(130);
  });
  it("credit 0 (free spin / jackpot / no coin prize) only reads the total", async () => {
    const { admin, wallet } = fakeAdmin({ wheel_cash_total: 100 });
    expect(await addWheelCash(admin, "u1", 0)).toBe(100);
    expect(wallet.wheel_cash_total).toBe(100);
  });
  it("returns null when the column doesn't exist (migration 0013 missing)", async () => {
    expect(await addWheelCash(fakeAdmin({ balance: 5 }).admin, "u1", 10)).toBeNull();
  });
});
