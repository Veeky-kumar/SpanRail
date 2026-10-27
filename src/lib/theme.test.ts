import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_COOKIE, themeCookie } from "./theme";

describe("resolveTheme", () => {
  it("accepts the three known choices", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("system")).toBe("system");
  });

  it("defaults to light when there is no cookie", () => {
    expect(resolveTheme(undefined)).toBe("light");
    expect(resolveTheme(null)).toBe("light");
    expect(resolveTheme("")).toBe("light");
  });

  it("never trusts an unknown cookie value (it is user-controlled and lands in an HTML attribute)", () => {
    for (const bad of ["DARK", "dark ", "midnight", '"><script>', "light; dark", "system\n"]) {
      expect(resolveTheme(bad)).toBe("light");
    }
  });
});

describe("themeCookie", () => {
  it("builds a long-lived, site-wide, lax cookie for the chosen theme", () => {
    const c = themeCookie("dark");
    expect(c.startsWith(`${THEME_COOKIE}=dark;`)).toBe(true);
    expect(c).toContain("path=/");
    expect(c).toContain("samesite=lax");
    expect(c).toMatch(/max-age=\d{7,}/);
  });
});
