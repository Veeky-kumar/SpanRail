import { describe, expect, it } from "vitest";
import { percentile, summarizeTimings, timingsOf } from "./timingSummary";

const gw = (total: number, ttfb: number, extra: Record<string, number> = {}, connReused = false) => ({
  timingMs: { total, ttfb, ...extra },
  connReused,
});

describe("percentile", () => {
  it("interpolates between neighbours", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10], 0.95)).toBe(10);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("summarizeTimings", () => {
  it("returns null for no calls", () => {
    expect(summarizeTimings([])).toBeNull();
  });

  it("averages each phase over every call, counting a phase that did not happen as zero", () => {
    // Call one set up a connection (10 + 20 + 30 = 60 ms), waited 140 ms more, then transferred 100 ms.
    // Call two reused one: no setup phases, wait 100 ms, transfer 100 ms.
    const s = summarizeTimings(
      timingsOf([gw(300, 200, { dns: 10, connect: 20, tls: 30 }, false), gw(200, 100, {}, true)]),
    )!;
    expect(s.calls).toBe(2);
    expect(s.meanMs.dns).toBe(5);
    expect(s.meanMs.connect).toBe(10);
    expect(s.meanMs.tls).toBe(15);
    expect(s.meanMs.wait).toBe(120); // (140 + 100) / 2
    expect(s.meanMs.transfer).toBe(100);
    expect(s.meanTotalMs).toBe(250);
    expect(s.reusedShare).toBe(0.5);
  });

  it("puts every call in a bin, the longest ones into the last", () => {
    const calls = Array.from({ length: 100 }, (_, i) => gw(100 + i, 50));
    calls.push(gw(60_000, 50)); // one stuck request
    const s = summarizeTimings(timingsOf(calls), 10)!;
    expect(s.bins).toHaveLength(10);
    expect(s.bins.reduce((a, b) => a + b.count, 0)).toBe(101);
    expect(s.bins[9].count).toBeGreaterThanOrEqual(1);
    expect(s.p95Ms).toBeLessThan(500);
  });

  it("ignores entries with no valid timing", () => {
    expect(timingsOf([{}, null, { timingMs: { ttfb: 3 } }, gw(10, 5)])).toHaveLength(1);
  });

  it("reports no reuse share when no call says either way", () => {
    expect(summarizeTimings(timingsOf([{ timingMs: { total: 10, ttfb: 5 } }]))!.reusedShare).toBeNull();
  });
});
