import { describe, expect, it } from "vitest";
import { parseGatewayTiming, type GatewayTiming } from "@/lib/gatewayTiming";
import { SAMPLE_TIMING } from "@/lib/sampleTrace";
import { DIAL_FROM, DIAL_SPAN, RULER_LEN, X0, carriageX, elapsedMs, needleAngle, railOf, readoutOf, totalMs } from "./rail";

const timingOf = (t: Record<string, number>, extra: Record<string, unknown> = {}): GatewayTiming =>
  parseGatewayTiming({ gateway: { timingMs: t, ...extra } })!;

const endOf = (model: ReturnType<typeof railOf>) => model.segs[model.segs.length - 1].x0 + model.segs[model.segs.length - 1].w;

describe("railOf: the sample call", () => {
  const model = railOf(SAMPLE_TIMING);

  it("runs the ruler and the dial to the next round number above the total", () => {
    expect(model.spanMs).toBe(400);
    expect(model.tickMs).toBe(100); // 50 ms steps would need 8 intervals; the ruler keeps to 6
    expect(model.unit).toBe("ms");
    expect(model.k).toBeCloseTo(RULER_LEN / 400, 9);
  });

  it("lays the five phases end to end from zero, in call order", () => {
    expect(model.segs.map((s) => s.key)).toEqual(["dns", "connect", "tls", "wait", "transfer"]);
    expect(model.segs[0].x0).toBe(X0);
    for (let i = 1; i < model.segs.length; i++) expect(model.segs[i].x0).toBeCloseTo(model.segs[i - 1].x0 + model.segs[i - 1].w, 9);
  });

  it("knows how long the call is with and without the setup phases", () => {
    expect(model.totalFresh).toBeCloseTo(374, 6);
    expect(model.totalReused).toBeCloseTo(308, 6);
    expect(model.setupMs).toBeCloseTo(66, 6);
  });

  it("widens a phase that would be invisible, and says it did", () => {
    const connect = model.segs.find((s) => s.key === "connect")!;
    expect(connect.w).toBeGreaterThanOrEqual(1.4);
    expect(model.widened).toContain("connect");
    expect(model.widened).not.toContain("wait");
  });
});

describe("railOf: any call fits the same ruler", () => {
  it.each([
    ["a 20 ms call", { ttfb: 15, total: 20 }, "ms"],
    ["a 374 ms call", { dns: 44.3, connect: 0.5, tls: 21.2, ttfb: 267, total: 374 }, "ms"],
    ["a 2.4 s call", { ttfb: 1900, total: 2400 }, "ms"],
    ["a 60 s call", { ttfb: 20000, total: 60000 }, "s"],
  ])("%s", (_name, t, unit) => {
    const model = railOf(timingOf(t as Record<string, number>));
    expect(model.unit).toBe(unit);
    expect(model.spanMs).toBeGreaterThanOrEqual(model.totalFresh);
    expect(model.spanMs % model.tickMs).toBeCloseTo(0, 6);
    expect(endOf(model)).toBeLessThanOrEqual(X0 + RULER_LEN + 1.5); // only widened hairline phases may overhang, by a hair
    expect(model.k * model.spanMs).toBeCloseTo(RULER_LEN, 6);
  });
});

describe("carriage, elapsed time and dial", () => {
  const model = railOf(SAMPLE_TIMING);

  it("starts at zero, never moves backwards, and ends at the end of the last block", () => {
    const xs = [0, 1, 2, 3, 4, 5, 6].map((step) => carriageX(model, step, false));
    expect(xs[0]).toBe(X0);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    expect(xs[6]).toBeCloseTo(endOf(model), 9);
  });

  it("slides the later blocks back over the setup blocks on a reused connection", () => {
    expect(carriageX(model, 6, true)).toBeCloseTo(endOf(model) - model.setupShift, 9);
    expect(carriageX(model, 0, true)).toBe(X0);
  });

  it("reads elapsed and total time from the same numbers as the stepper", () => {
    expect(elapsedMs(model, 4, false)).toBeCloseTo(267, 6);
    expect(elapsedMs(model, 6, false)).toBeCloseTo(374, 6);
    expect(elapsedMs(model, 4, true)).toBeCloseTo(201, 6);
    expect(totalMs(model, true)).toBeCloseTo(308, 6);
  });

  it("sweeps the needle across the dial, clamped at both ends", () => {
    expect(needleAngle(model, 0)).toBeCloseTo(DIAL_FROM, 9);
    expect(needleAngle(model, 400)).toBeCloseTo(DIAL_FROM + DIAL_SPAN, 9);
    expect(needleAngle(model, 200)).toBeCloseTo(DIAL_FROM + DIAL_SPAN / 2, 9);
    expect(needleAngle(model, -5)).toBeCloseTo(DIAL_FROM, 9);
    expect(needleAngle(model, 9999)).toBeCloseTo(DIAL_FROM + DIAL_SPAN, 9);
  });

  it("formats the readout", () => {
    expect(readoutOf(0, 374)).toBe("0.0 of 374 ms");
    expect(readoutOf(267, 374)).toBe("267 of 374 ms");
    expect(readoutOf(1900, 2400)).toBe("1.90 of 2.40 s");
    expect(readoutOf(20000, 60000)).toBe("20.0 of 60.0 s");
  });
});

describe("a call that already reused its connection", () => {
  const model = railOf(timingOf({ ttfb: 190, total: 300 }, { connReused: true }));

  it("has no setup blocks and nothing to slide", () => {
    expect(model.segs.map((s) => s.key)).toEqual(["wait", "transfer"]);
    expect(model.setupShift).toBe(0);
    expect(model.setupMs).toBe(0);
    expect(model.totalReused).toBe(model.totalFresh);
  });

  it("puts the carriage in the same place whichever way the toggle is set", () => {
    expect(carriageX(model, 6, true)).toBeCloseTo(carriageX(model, 6, false), 9);
  });
});

describe("a call with no response byte", () => {
  it("draws only the phases that happened", () => {
    const model = railOf(timingOf({ dns: 30, connect: 10, total: 40 }));
    expect(model.segs.map((s) => s.key)).toEqual(["dns", "connect"]);
    expect(endOf(model)).toBeLessThanOrEqual(X0 + RULER_LEN + 1.5);
  });
});
