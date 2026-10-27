import { describe, expect, it } from "vitest";
import { STAGES, journeyState, nextStep, normalizeStep, prevStep } from "./callJourney";

const statusOf = (step: number, reused: boolean) =>
  Object.fromEntries(journeyState(step, reused).stages.map((s) => [s.key, s.status]));
const phaseStatus = (step: number, reused: boolean) =>
  Object.fromEntries(journeyState(step, reused).phases.map((p) => [p.key, p.status]));

describe("STAGES", () => {
  it("walks one call in order, from the app to the report", () => {
    expect(STAGES.map((s) => s.key)).toEqual(["request", "dns", "connect", "tls", "wait", "transfer", "report"]);
  });

  it("gives every stage the three things the page explains", () => {
    for (const s of STAGES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.happens.length).toBeGreaterThan(0);
      expect(s.records.length).toBeGreaterThan(0);
      expect(s.slow.length).toBeGreaterThan(0);
    }
  });
});

describe("journeyState on a new connection", () => {
  it("has every phase upcoming before the network work starts", () => {
    expect(Object.values(phaseStatus(0, false))).toEqual(["upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks earlier stages done, the current one active, later ones upcoming", () => {
    const s = statusOf(4, false);
    expect(s).toMatchObject({ request: "done", dns: "done", connect: "done", tls: "done", wait: "active", transfer: "upcoming", report: "upcoming" });
    expect(phaseStatus(4, false)).toEqual({ dns: "done", connect: "done", tls: "done", wait: "active", transfer: "upcoming" });
  });

  it("finishes with every phase done at the report stage, and the sample adds up", () => {
    expect(Object.values(phaseStatus(6, false)).every((s) => s === "done")).toBe(true);
    const st = journeyState(6, false);
    expect(st.totalMs).toBeCloseTo(374, 6);
    expect(st.phases.reduce((a, p) => a + p.ms, 0)).toBeCloseTo(374, 6);
  });
});

describe("journeyState on a reused connection", () => {
  it("has no DNS, connect or TLS phase at all (absent, not zero)", () => {
    expect(journeyState(3, true).phases.map((p) => p.key)).toEqual(["wait", "transfer"]);
    expect(journeyState(6, true).totalMs).toBeCloseTo(308, 6);
  });

  it("marks the setup stages skipped wherever the reader is", () => {
    for (const step of [0, 2, 4, 6]) {
      const s = statusOf(step, true);
      expect([s.dns, s.connect, s.tls]).toEqual(["skipped", "skipped", "skipped"]);
    }
  });
});

describe("stepping", () => {
  it("skips the setup stages on a reused connection, in both directions", () => {
    expect(nextStep(0, true)).toBe(4);
    expect(prevStep(4, true)).toBe(0);
    expect(nextStep(0, false)).toBe(1);
    expect(prevStep(4, false)).toBe(3);
  });

  it("stays inside the first and last stage", () => {
    expect(nextStep(6, false)).toBe(6);
    expect(nextStep(6, true)).toBe(6);
    expect(prevStep(0, false)).toBe(0);
    expect(prevStep(0, true)).toBe(0);
  });

  it("moves a skipped position forward when the connection kind changes", () => {
    expect(normalizeStep(2, true)).toBe(4);
    expect(normalizeStep(2, false)).toBe(2);
    expect(normalizeStep(-3, false)).toBe(0);
    expect(normalizeStep(99, false)).toBe(6);
  });
});
