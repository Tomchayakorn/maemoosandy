import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getSlipProvider } from "./index";

afterEach(() => vi.unstubAllEnvs());

describe("getSlipProvider", () => {
  it("never offers the mock provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SLIP_PROVIDER", "mock");
    expect(getSlipProvider()).toBeNull();
  });

  it("offers the mock provider in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SLIP_PROVIDER", "mock");
    expect(getSlipProvider()?.name).toBe("mock");
  });

  it("needs an API key for real providers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SLIP_PROVIDER", "easyslip");
    vi.stubEnv("SLIP_API_KEY", "");
    expect(getSlipProvider()).toBeNull();
    vi.stubEnv("SLIP_API_KEY", "k");
    expect(getSlipProvider()?.name).toBe("easyslip");
  });

  it("defaults to EasySlip and needs a branch id for SlipOK", () => {
    vi.stubEnv("SLIP_API_KEY", "k");
    vi.stubEnv("SLIP_PROVIDER", "");
    expect(getSlipProvider()?.name).toBe("easyslip");
    vi.stubEnv("SLIP_PROVIDER", "slipok");
    vi.stubEnv("SLIPOK_BRANCH_ID", "");
    expect(getSlipProvider()).toBeNull();
    vi.stubEnv("SLIPOK_BRANCH_ID", "123");
    expect(getSlipProvider()?.name).toBe("slipok");
  });

  it("mock gives the same reference for the same image (so duplicates are caught)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SLIP_PROVIDER", "mock");
    const p = getSlipProvider()!;
    const a = await p.verify({ file: new Blob(["same"]), fileName: "a.png", expectedAmount: 99 });
    const b = await p.verify({ file: new Blob(["same"]), fileName: "b.png", expectedAmount: 99 });
    const c = await p.verify({ file: new Blob(["other"]), fileName: "c.png", expectedAmount: 99 });
    if (!a.ok || !b.ok || !c.ok) throw new Error("mock should accept");
    expect(a.slip.transRef).toBe(b.slip.transRef);
    expect(a.slip.transRef).not.toBe(c.slip.transRef);
  });
});
