import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./site";
import robots from "../app/robots";
import sitemap from "../app/sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("is null when SITE_URL is unset or blank", () => {
    vi.stubEnv("SITE_URL", "");
    expect(siteUrl()).toBeNull();
    vi.stubEnv("SITE_URL", "   ");
    expect(siteUrl()).toBeNull();
  });

  it("returns the origin, dropping any path and trailing slash", () => {
    vi.stubEnv("SITE_URL", "https://spanrail.onrender.com/");
    expect(siteUrl()).toBe("https://spanrail.onrender.com");
    vi.stubEnv("SITE_URL", "https://example.com/app/x?y=1");
    expect(siteUrl()).toBe("https://example.com");
  });

  it("rejects values that are not http(s) addresses", () => {
    vi.stubEnv("SITE_URL", "not a url");
    expect(siteUrl()).toBeNull();
    vi.stubEnv("SITE_URL", "javascript:alert(1)");
    expect(siteUrl()).toBeNull();
  });
});

describe("robots and sitemap", () => {
  it("keep crawlers out of a private install", () => {
    vi.stubEnv("SITE_URL", "");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(sitemap()).toEqual([]);
  });

  it("open only the landing page of a public instance and point at the sitemap", () => {
    vi.stubEnv("SITE_URL", "https://spanrail.onrender.com");
    const r = robots();
    expect(r.sitemap).toBe("https://spanrail.onrender.com/sitemap.xml");
    expect(r.rules).toMatchObject({ allow: "/", disallow: ["/api/", "/projects/", "/admin/"] });
    expect(sitemap().map((s) => s.url)).toEqual(["https://spanrail.onrender.com/"]);
  });
});
