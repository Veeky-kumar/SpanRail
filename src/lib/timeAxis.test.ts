import { describe, expect, it } from "vitest";
import { niceTicks, phaseLayout, slowestPhase } from "./timeAxis";

describe("niceTicks", () => {
  it("picks round steps that stay within the tick budget", () => {
    const { ticks, unit } = niceTicks(267);
    expect(unit).toBe("ms");
    expect(ticks.map((t) => t.ms)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(ticks.map((t) => t.label)).toEqual(["0", "50", "100", "150", "200", "250"]);
  });

  it("never emits a tick beyond the span, and always starts at zero", () => {
    for (const span of [1, 7, 42, 267, 999, 1234, 18_500, 96_000]) {
      const { ticks } = niceTicks(span);
      expect(ticks[0].ms).toBe(0);
      expect(Math.max(...ticks.map((t) => t.ms))).toBeLessThanOrEqual(span);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });

  it("switches to seconds from 5 s so labels stay short", () => {
    const { ticks, unit } = niceTicks(12_000);
    expect(unit).toBe("s");
    expect(ticks.map((t) => t.label)).toEqual(["0", "2", "4", "6", "8", "10", "12"]);
  });

  it("uses decimals for sub-millisecond spans instead of repeating labels", () => {
    const { ticks } = niceTicks(0.8);
    const labels = ticks.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[1]).toBe("0.2");
  });

  it("degrades to a single zero tick for an empty or invalid span", () => {
    for (const span of [0, -5, Number.NaN, Infinity]) {
      expect(niceTicks(span).ticks).toEqual([{ ms: 0, label: "0" }]);
    }
  });
});

describe("phaseLayout", () => {
  const phases = [
    { key: "dns" as const, label: "DNS lookup", ms: 44 },
    { key: "connect" as const, label: "TCP connect", ms: 0.5 },
    { key: "wait" as const, label: "Upstream wait", ms: 222 },
  ];

  it("places segments end to end in order, proportional to their duration", () => {
    const l = phaseLayout([phases[0], phases[2]], 266);
    expect(l.map((s) => s.key)).toEqual(["dns", "wait"]);
    expect(l[0].startPct).toBe(0);
    expect(l[1].startPct).toBeCloseTo(l[0].widthPct, 6);
    expect(l[0].widthPct).toBeCloseTo((44 / 266) * 100, 6);
  });

  it("keeps a tiny phase visible with a minimum width and still fits in 100%", () => {
    const l = phaseLayout(phases, 266.5, 1.5);
    const connect = l.find((s) => s.key === "connect")!;
    expect(connect.widthPct).toBeGreaterThanOrEqual(1.5);
    const end = l[l.length - 1].startPct + l[l.length - 1].widthPct;
    expect(end).toBeLessThanOrEqual(100 + 1e-9);
  });

  it("leaves the unaccounted remainder empty when phases sum to less than the total", () => {
    const l = phaseLayout([phases[0]], 200);
    expect(l[0].widthPct).toBeCloseTo(22, 6);
  });

  it("never exceeds 100% when phases sum to more than the total (clock skew)", () => {
    const l = phaseLayout([phases[0], phases[2]], 100);
    const end = l[l.length - 1].startPct + l[l.length - 1].widthPct;
    expect(end).toBeLessThanOrEqual(100 + 1e-9);
  });

  it("drops zero-length phases and handles a zero total", () => {
    expect(phaseLayout([{ key: "dns", label: "DNS lookup", ms: 0 }], 10)).toEqual([]);
    expect(phaseLayout(phases, 0)).toEqual([]);
  });
});

describe("slowestPhase", () => {
  it("returns the phase that took the longest", () => {
    expect(slowestPhase([{ key: "dns", label: "DNS lookup", ms: 44 }, { key: "wait", label: "Upstream wait", ms: 222 }])?.key).toBe("wait");
  });

  it("returns null when there is nothing to blame", () => {
    expect(slowestPhase([])).toBeNull();
    expect(slowestPhase([{ key: "dns", label: "DNS lookup", ms: 0 }])).toBeNull();
  });
});
