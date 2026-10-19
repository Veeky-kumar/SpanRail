import { describe, expect, it } from "vitest";
import { parseGatewayTiming } from "./gatewayTiming";

const meta = (timingMs: unknown, extra: Record<string, unknown> = {}) => ({ gateway: { timingMs, ...extra } });

describe("parseGatewayTiming", () => {
  it("splits a fresh connection into setup phases, server wait and transfer", () => {
    const t = parseGatewayTiming(
      meta({ dns: 47.4, connect: 0.5, tls: 20, ttfb: 189.1, total: 200 }, { connReused: false, status: 200 }),
    );
    expect(t).not.toBeNull();
    expect(t!.phases.map((p) => p.key)).toEqual(["dns", "connect", "tls", "wait", "transfer"]);
    const byKey = Object.fromEntries(t!.phases.map((p) => [p.key, p.ms]));
    expect(byKey.dns).toBe(47.4);
    expect(byKey.wait).toBeCloseTo(189.1 - 47.4 - 0.5 - 20, 6); // ttfb includes the setup phases
    expect(byKey.transfer).toBeCloseTo(200 - 189.1, 6);
    expect(t!.totalMs).toBe(200);
    expect(t!.connReused).toBe(false);
    expect(t!.status).toBe(200);
  });

  it("omits setup phases that did not happen (reused connection) instead of showing zeros", () => {
    const t = parseGatewayTiming(meta({ ttfb: 41.2, total: 41.2 }, { connReused: true }))!;
    expect(t.phases.map((p) => p.key)).toEqual(["wait", "transfer"]);
    expect(t.connReused).toBe(true);
  });

  it("keeps only what was measured when no response byte arrived", () => {
    const t = parseGatewayTiming(meta({ dns: 3, total: 10 }))!;
    expect(t.phases.map((p) => p.key)).toEqual(["dns"]);
    expect(t.ttfbMs).toBeNull();
  });

  it("never produces negative segments", () => {
    const t = parseGatewayTiming(meta({ dns: 50, ttfb: 40, total: 30 }))!;
    for (const p of t.phases) expect(p.ms).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ["no metadata", null],
    ["not an object", "x"],
    ["no gateway key", { other: 1 }],
    ["no timingMs", { gateway: {} }],
    ["timingMs not an object", { gateway: { timingMs: 5 } }],
    ["total missing", { gateway: { timingMs: { ttfb: 5 } } }],
    ["total not finite", { gateway: { timingMs: { total: Infinity } } }],
    ["total negative", { gateway: { timingMs: { total: -1 } } }],
  ])("returns null for %s", (_name, input) => {
    expect(parseGatewayTiming(input)).toBeNull();
  });

  it("ignores phases that are not finite non-negative numbers", () => {
    const t = parseGatewayTiming(meta({ dns: "12", connect: -3, tls: null, ttfb: 5, total: 6 }))!;
    expect(t.phases.map((p) => p.key)).toEqual(["wait", "transfer"]);
  });
});
