import { describe, expect, it } from "vitest";
import { furthestStep, funnelOf, sourceLabel } from "./growth";

describe("furthestStep", () => {
  it("names the last step a user reached, in order", () => {
    expect(furthestStep({ project: false, apiKey: false, trace: false, gateway: false })).toBe("signed-up");
    expect(furthestStep({ project: true, apiKey: false, trace: false, gateway: false })).toBe("project");
    expect(furthestStep({ project: true, apiKey: true, trace: false, gateway: false })).toBe("api-key");
    expect(furthestStep({ project: true, apiKey: true, trace: true, gateway: false })).toBe("first-trace");
    expect(furthestStep({ project: true, apiKey: true, trace: true, gateway: true })).toBe("gateway-call");
  });
});

describe("funnelOf", () => {
  it("gives each step's count and its share of everyone who signed up", () => {
    const f = funnelOf({ signedUp: 200, project: 100, apiKey: 50, trace: 20, gateway: 5 });
    expect(f.map((s) => [s.id, s.count, s.pctOfSignups])).toEqual([
      ["signed-up", 200, 100],
      ["project", 100, 50],
      ["api-key", 50, 25],
      ["first-trace", 20, 10],
      ["gateway-call", 5, 2.5],
    ]);
  });

  it("adds the step-to-step conversion, null where the earlier step is empty", () => {
    const f = funnelOf({ signedUp: 10, project: 5, apiKey: 0, trace: 0, gateway: 0 });
    expect(f[1].pctOfPrevious).toBe(50);
    expect(f[2].pctOfPrevious).toBe(0);
    expect(f[3].pctOfPrevious).toBeNull();
  });

  it("does not divide by zero with no signups", () => {
    const f = funnelOf({ signedUp: 0, project: 0, apiKey: 0, trace: 0, gateway: 0 });
    expect(f.every((s) => s.pctOfSignups === null)).toBe(true);
  });
});

describe("sourceLabel", () => {
  it("prefers the utm source, then the referrer host, then direct", () => {
    expect(sourceLabel({ referrer: "github.com", utmSource: "readme" })).toBe("readme");
    expect(sourceLabel({ referrer: "github.com", utmSource: null })).toBe("github.com");
    expect(sourceLabel({ referrer: null, utmSource: null })).toBe("direct");
  });
});
