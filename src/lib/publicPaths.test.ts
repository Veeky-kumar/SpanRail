import { describe, expect, it } from "vitest";
import { isAuthPage, isPublicPath } from "./publicPaths";

describe("isAuthPage", () => {
  it("is true only for the sign in and sign up pages", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/signup")).toBe(true);
    expect(isAuthPage("/")).toBe(false);
    expect(isAuthPage("/loginx")).toBe(false);
    expect(isAuthPage("/login/extra")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("lets signed-out visitors see the landing page, auth pages and the favicon", () => {
    for (const p of ["/", "/login", "/signup", "/icon.svg"]) expect(isPublicPath(p)).toBe(true);
  });

  it("lets crawlers and link-preview bots read robots.txt, the sitemap and the preview image", () => {
    for (const p of ["/robots.txt", "/sitemap.xml", "/og.png"]) expect(isPublicPath(p)).toBe(true);
    expect(isPublicPath("/sitemap.xml/x")).toBe(false);
  });

  it("keeps everything else behind sign in", () => {
    for (const p of ["/projects", "/projects/p1", "/projects/p1/traces/t1", "/api/other", "/settings", "/loginx", "/signup/extra"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("is exact: no prefix or look-alike match opens a private page", () => {
    expect(isPublicPath("//")).toBe(false);
    expect(isPublicPath("/icon.svg/x")).toBe(false);
    expect(isPublicPath("/?x=1".split("?")[0])).toBe(true);
  });
});
