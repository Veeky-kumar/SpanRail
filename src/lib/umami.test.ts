import { describe, expect, it } from "vitest";
import { umamiConfig } from "./umami";

const ID = "6f1f3c1e-8f6e-4c53-9a39-2a1d0f1b7e10";

describe("umamiConfig", () => {
  it("is on only when both the script URL and a website id are set and valid", () => {
    expect(umamiConfig({ UMAMI_SCRIPT_URL: "https://cloud.umami.is/script.js", UMAMI_WEBSITE_ID: ID })).toEqual({
      src: "https://cloud.umami.is/script.js",
      websiteId: ID,
    });
  });

  it("is off when either is missing, so a self-hosted install never loads a tracker", () => {
    expect(umamiConfig({})).toBeNull();
    expect(umamiConfig({ UMAMI_SCRIPT_URL: "https://x.io/script.js" })).toBeNull();
    expect(umamiConfig({ UMAMI_WEBSITE_ID: ID })).toBeNull();
  });

  it("rejects a website id that is not a UUID and a script URL that is not https", () => {
    expect(umamiConfig({ UMAMI_SCRIPT_URL: "https://x.io/script.js", UMAMI_WEBSITE_ID: "abc" })).toBeNull();
    expect(umamiConfig({ UMAMI_SCRIPT_URL: "http://x.io/script.js", UMAMI_WEBSITE_ID: ID })).toBeNull();
    expect(umamiConfig({ UMAMI_SCRIPT_URL: "javascript:alert(1)", UMAMI_WEBSITE_ID: ID })).toBeNull();
  });

  it("allows plain http only for localhost, for development", () => {
    expect(umamiConfig({ UMAMI_SCRIPT_URL: "http://localhost:3001/script.js", UMAMI_WEBSITE_ID: ID })?.src).toBe(
      "http://localhost:3001/script.js",
    );
  });
});
