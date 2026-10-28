import { describe, expect, it } from "vitest";
import { cleanVerificationToken, siteMetadata } from "./siteMetadata";

const TOKEN = "8eBWAJZwo43sOOVKO8Qn6lyn-O3txgqmC7SbI8He7r4";

describe("cleanVerificationToken", () => {
  it("accepts a Search Console token and trims it", () => {
    expect(cleanVerificationToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it("rejects empty values and anything that is not a plain token", () => {
    expect(cleanVerificationToken(undefined)).toBeUndefined();
    expect(cleanVerificationToken("")).toBeUndefined();
    expect(cleanVerificationToken("short")).toBeUndefined();
    expect(cleanVerificationToken(`"><script>alert(1)</script>${TOKEN}`)).toBeUndefined();
    expect(cleanVerificationToken(`google-site-verification=${TOKEN}`)).toBeUndefined();
  });
});

describe("siteMetadata", () => {
  it("asks search engines to stay away from a private install, whatever the token says", () => {
    const m = siteMetadata(null, TOKEN);
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.verification).toBeUndefined();
    expect(m.openGraph).toBeUndefined();
  });

  it("gives a public instance a preview card and no verification tag by default", () => {
    const m = siteMetadata("https://spanrail.onrender.com");
    expect(m.robots).toBeUndefined();
    expect(m.openGraph).toBeDefined();
    expect(m.verification).toBeUndefined();
  });

  it("adds the Google verification tag only when a valid token is set", () => {
    expect(siteMetadata("https://spanrail.onrender.com", TOKEN).verification).toEqual({ google: TOKEN });
    expect(siteMetadata("https://spanrail.onrender.com", "not a token").verification).toBeUndefined();
  });
});
