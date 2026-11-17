import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { mapThunderResponse } from "./thunder";

describe("mapThunderResponse", () => {
  it("maps a success body", () => {
    const r = mapThunderResponse(200, {
      status: 200,
      data: { transRef: "T1", date: "2026-11-18T10:00:00+07:00", amount: { amount: 99 }, receiver: { account: { name: { th: "น.ส. ธัญญ์รวี ร" }, proxy: { account: "xxx-xxx-2265" } } } },
    });
    expect(r).toMatchObject({ ok: true, slip: { transRef: "T1", amount: 99, receiverName: "น.ส. ธัญญ์รวี ร", receiverAccount: "xxx-xxx-2265" } });
  });
  it("maps duplicate / not found / pending", () => {
    expect(mapThunderResponse(400, { status: 400, message: "duplicate_slip" })).toMatchObject({ ok: false, code: "DUPLICATE" });
    expect(mapThunderResponse(404, { status: 404, message: "slip_not_found" })).toMatchObject({ ok: false, code: "NOT_A_SLIP" });
    expect(mapThunderResponse(404, { status: 404, message: "slip_pending" })).toMatchObject({ ok: false, code: "SLIP_PENDING" });
    expect(mapThunderResponse(403, { status: 403, message: "quota_exceeded" })).toMatchObject({ ok: false, code: "PROVIDER_ERROR" });
  });
});
