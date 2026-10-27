import { describe, expect, it } from "vitest";
import { countryFromHeaders, parseSourceCookie, serializeSource, sourceFromLocation } from "./attribution";

describe("sourceFromLocation", () => {
  it("records the referring host without www, and the utm tags", () => {
    const s = sourceFromLocation("https://www.news.ycombinator.com/item?id=1", "?utm_source=hn&utm_medium=post&utm_campaign=launch", "spanrail.dev");
    expect(s).toEqual({ referrer: "news.ycombinator.com", utmSource: "hn", utmMedium: "post", utmCampaign: "launch" });
  });

  it("treats an empty referrer as direct and ignores the site's own pages", () => {
    expect(sourceFromLocation("", "", "spanrail.dev").referrer).toBeNull();
    expect(sourceFromLocation("https://spanrail.dev/login", "", "spanrail.dev").referrer).toBeNull();
  });

  it("never stores a path or query string of the referrer, only its host", () => {
    const s = sourceFromLocation("https://example.com/secret/path?token=abc", "", "spanrail.dev");
    expect(JSON.stringify(s)).not.toContain("secret");
    expect(JSON.stringify(s)).not.toContain("token");
  });

  it("survives a malformed referrer", () => {
    expect(sourceFromLocation("not a url", "", "spanrail.dev").referrer).toBeNull();
  });
});

describe("parseSourceCookie / serializeSource", () => {
  it("round-trips", () => {
    const a = { referrer: "github.com", utmSource: "readme", utmMedium: null, utmCampaign: null };
    expect(parseSourceCookie(serializeSource(a))).toEqual(a);
  });

  it("returns an empty attribution for a missing or corrupt cookie", () => {
    const empty = { referrer: null, utmSource: null, utmMedium: null, utmCampaign: null };
    expect(parseSourceCookie(undefined)).toEqual(empty);
    expect(parseSourceCookie("%E0%A4%A")).toEqual(empty);
    expect(parseSourceCookie(encodeURIComponent("[1,2]"))).toEqual(empty);
  });

  it("trims, strips control characters and caps length, since the cookie is user-controlled", () => {
    const raw = encodeURIComponent(JSON.stringify({ referrer: "  evil.com\u0000\n", utmSource: "x".repeat(500), utmMedium: 42, utmCampaign: "<script>" }));
    const s = parseSourceCookie(raw);
    expect(s.referrer).toBe("evil.com");
    expect(s.utmSource!.length).toBe(80);
    expect(s.utmMedium).toBeNull();
    expect(s.utmCampaign).toBe("<script>"); // stored as data and always rendered as text by React
  });
});

describe("countryFromHeaders", () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

  it("reads a two-letter country code from the edge headers", () => {
    expect(countryFromHeaders(headers({ "cf-ipcountry": "in" }))).toBe("IN");
    expect(countryFromHeaders(headers({ "x-vercel-ip-country": "DE" }))).toBe("DE");
  });

  it("returns null for anything else, including Cloudflare's unknown markers", () => {
    expect(countryFromHeaders(headers({}))).toBeNull();
    expect(countryFromHeaders(headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(countryFromHeaders(headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(countryFromHeaders(headers({ "cf-ipcountry": "India" }))).toBeNull();
  });
});
