import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_URL, normalizeSiteUrl } from "./site-url";

describe("normalizeSiteUrl", () => {
  it("falls back to the production domain when unset or blank", () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("   ")).toBe(DEFAULT_SITE_URL);
    expect(DEFAULT_SITE_URL).toBe("https://maemoosandy-7mp3.vercel.app");
  });
  it("trims trailing slashes and adds https when the protocol is missing", () => {
    expect(normalizeSiteUrl("https://example.com//")).toBe("https://example.com");
    expect(normalizeSiteUrl("example.com")).toBe("https://example.com");
    expect(normalizeSiteUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });
});
