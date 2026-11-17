import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { spinDirect } from "./spin-direct";
import { WHEEL_SEGMENTS } from "./segments";

type Row = Record<string, unknown>;

/** Tiny in-memory stand-in for the supabase-js query builder (only what spinDirect uses). */
function fakeAdmin(initial: { wallet: Row; paidLedgerRows?: number }) {
  const tables: Record<string, Row[]> = { wallets: [{ user_id: "u1", ...initial.wallet }], wallet_ledger: [], spin_logs: [] };
  let clock = 0;
  let idSeq = 0;
  for (let i = 0; i < (initial.paidLedgerRows ?? 0); i++) {
    tables.wallet_ledger.push({ id: `seed${i}`, user_id: "other", reason: "spin", coins_delta: -99, created_at: new Date(clock++).toISOString() });
  }

  function builder(table: string) {
    let op: "select" | "update" | "insert" | "delete" = "select";
    let patch: Row = {};
    let inserted: Row | null = null;
    const filters: ((r: Row) => boolean)[] = [];
    let head = false;
    const b = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        head = !!opts?.head;
        return b;
      },
      update(p: Row) { op = "update"; patch = p; return b; },
      delete() { op = "delete"; return b; },
      insert(row: Row) {
        op = "insert";
        inserted = { id: row.id ?? `gen${idSeq++}`, created_at: new Date(clock++).toISOString(), ...row };
        tables[table].push(inserted);
        return b;
      },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return b; },
      or(expr: string) {
        const m = expr.match(/created_at\.lt\.(.+?),and\(created_at\.eq\.(.+?),id\.lte\.(.+?)\)/)!;
        filters.push((r) => (r.created_at as string) < m[1] || ((r.created_at as string) === m[2] && (r.id as string) <= m[3]));
        return b;
      },
      async maybeSingle() { return { data: run()[0] ?? null, error: null }; },
      async single() { const rows = run(); return { data: rows[0] ?? null, error: rows[0] ? null : { message: "none" } }; },
      then(resolve: (v: unknown) => void) {
        const rows = run();
        resolve({ data: head ? null : rows, count: rows.length, error: null });
      },
    };
    function run(): Row[] {
      if (op === "insert") return inserted ? [inserted] : [];
      const rows = tables[table].filter((r) => filters.every((f) => f(r)));
      if (op === "update") rows.forEach((r) => Object.assign(r, patch));
      if (op === "delete") tables[table] = tables[table].filter((r) => !rows.includes(r));
      return rows;
    }
    return b;
  }
  return { admin: { from: builder } as never, tables };
}

const STD = WHEEL_SEGMENTS.find((s) => s.key === "coins_10_a")!;
const JACKPOT = WHEEL_SEGMENTS.find((s) => s.key === "jackpot_5000")!;
const spin = (admin: never) => spinDirect(admin, "u1", STD, JACKPOT, 99, 200);

describe("spinDirect (no-migration fallback)", () => {
  it("free ticket spin: uses the ticket, never numbers a paid spin, never the jackpot (even at paid count 199)", async () => {
    const { admin, tables } = fakeAdmin({ wallet: { balance: 1000, spin_tickets: 1, free_reading_tickets: 0 }, paidLedgerRows: 199 });
    const r = await spin(admin);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ paid: false, jackpot: false, balance: 1010, spinTickets: 0 });
    expect(tables.wallet_ledger.filter((l) => l.coins_delta === -99)).toHaveLength(199); // counter untouched
  });

  it("paid spin #1 .. #199 never jackpots; each charges 99 and credits the ordinary prize", async () => {
    const { admin } = fakeAdmin({ wallet: { balance: 100000, spin_tickets: 0, free_reading_tickets: 0 } });
    let balance = 100000;
    for (let n = 1; n <= 199; n++) {
      const r = await spin(admin);
      expect(r.data?.paid).toBe(true);
      expect(r.data?.jackpot).toBe(false);
      balance += -99 + 10;
      expect(r.data?.balance).toBe(balance);
    }
  });

  it("paid spin #200 (199 paid rows already exist) is the jackpot: balance −99 + 5,000, correct ledger", async () => {
    const { admin, tables } = fakeAdmin({ wallet: { balance: 1000, spin_tickets: 0, free_reading_tickets: 0 }, paidLedgerRows: 199 });
    const r = await spin(admin);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ paid: true, jackpot: true, balance: 1000 - 99 + 5000 });
    expect(tables.spin_logs[0]).toMatchObject({ reward_key: "jackpot_5000", reward_value: 5000 });
    expect(tables.wallet_ledger.filter((l) => l.user_id === "u1").map((l) => l.coins_delta).sort((a, b) => (a as number) - (b as number))).toEqual([-99, 5000]);
    // and #201 is ordinary again
    const next = await spin(admin);
    expect(next.data?.jackpot).toBe(false);
  });

  it("rejects a paid spin with fewer than 99 coins without touching the wallet or the count", async () => {
    const { admin, tables } = fakeAdmin({ wallet: { balance: 98, spin_tickets: 0, free_reading_tickets: 0 }, paidLedgerRows: 199 });
    const r = await spin(admin);
    expect(r.error?.message).toBe("INSUFFICIENT_COINS");
    expect(tables.wallets[0].balance).toBe(98);
    expect(tables.wallet_ledger).toHaveLength(199);
  });

  it("concurrent paid spins on one instance get distinct numbers (exactly one jackpot at #200)", async () => {
    const { admin } = fakeAdmin({ wallet: { balance: 100000, spin_tickets: 0, free_reading_tickets: 0 }, paidLedgerRows: 198 });
    const results = await Promise.all([spin(admin), spin(admin), spin(admin)]);
    expect(results.filter((r) => r.data?.jackpot).length).toBe(1);
  });
});
