import { describe, expect, it } from "vitest";
import { mainShareUrl } from "./share-link";

describe("mainShareUrl", () => {
  it("is always the origin of the configured domain, with a trailing slash", () => {
    expect(mainShareUrl("https://maemoo.example", "http://localhost:3000")).toBe("https://maemoo.example/");
    expect(mainShareUrl("https://maemoo.example/mystic-chests?x=1#top", "http://localhost:3000")).toBe("https://maemoo.example/");
  });
  it("falls back to the current origin, never to a sub page", () => {
    expect(mainShareUrl(undefined, "https://site.test")).toBe("https://site.test/");
    expect(mainShareUrl("", "https://site.test")).toBe("https://site.test/");
    expect(mainShareUrl("not a url", "https://site.test")).toBe("https://site.test/");
  });
  it("ignores non-http schemes", () => {
    expect(mainShareUrl("javascript:alert(1)", "https://site.test")).toBe("https://site.test/");
  });
  it("last resort is the site root", () => {
    expect(mainShareUrl(undefined, "")).toBe("/");
  });
});
