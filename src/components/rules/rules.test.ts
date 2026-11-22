import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GUARANTEE_DRY_COINS, GUARANTEE_DRY_ROUNDS, GUARANTEE_EVERY_COINS, GUARANTEE_EVERY_ROUNDS } from "../../lib/lucky-card/guarantee";
import * as server from "../../lib/lucky-card-config";
import { JACKPOT_EVERY_PAID_SPINS as SERVER_JACKPOT_EVERY } from "../../lib/wheel/rewards";
import { JACKPOT_EVERY_PAID_SPINS_DISPLAY } from "../../lib/wheel/display";

describe("rules pop-up numbers stay in sync with the server config", () => {
  it("lucky-card guarantee", () => {
    expect([GUARANTEE_DRY_ROUNDS, GUARANTEE_DRY_COINS, GUARANTEE_EVERY_ROUNDS, GUARANTEE_EVERY_COINS]).toEqual([
      server.GUARANTEE_DRY_ROUNDS, server.GUARANTEE_DRY_COINS, server.GUARANTEE_EVERY_ROUNDS, server.GUARANTEE_EVERY_COINS,
    ]);
  });
  it("wheel jackpot cycle", () => {
    expect(JACKPOT_EVERY_PAID_SPINS_DISPLAY).toBe(SERVER_JACKPOT_EVERY);
  });
});
