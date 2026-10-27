import { describe, expect, it } from "vitest";
import { PARCELS, SCENARIO, countersOf, readoutOf, type Beat } from "./model";

const placesOf = (beat: Beat, ids: string[]) => ids.map((id) => beat.places[id]);

describe("SCENARIO", () => {
  it("is a short loop: about a dozen to twenty beats, each long enough to read and short enough to hold attention", () => {
    expect(SCENARIO.length).toBeGreaterThanOrEqual(10);
    expect(SCENARIO.length).toBeLessThanOrEqual(20);
    for (const beat of SCENARIO) {
      expect(beat.dwellMs).toBeGreaterThanOrEqual(800);
      expect(beat.dwellMs).toBeLessThanOrEqual(3200);
      expect(beat.title.length).toBeGreaterThan(0);
      expect(beat.detail.length).toBeGreaterThan(0);
    }
  });

  it("names every parcel in every beat, and only parcels that exist", () => {
    const ids = PARCELS.map((p) => p.id).sort();
    for (const beat of SCENARIO) expect(Object.keys(beat.places).sort()).toEqual(ids);
  });

  it("starts with nothing processed and the receipt not yet out", () => {
    const first = SCENARIO[0];
    expect(first.ack).toBe(false);
    expect(countersOf(first)).toEqual({ waiting: 0, observations: 0, traces: 0, rejected: 0 });
  });

  it("acknowledges a batch before any of its parcels is processed (the API answers 207 first)", () => {
    for (const beat of SCENARIO) {
      const atGate = Object.values(beat.places).some((p) => p === "chute");
      const worked = Object.values(beat.places).some((p) => p === "tray" || p === "press" || p === "drawer");
      // While a batch is still at the gate its receipt is not out; once the gate is clear, work has begun and it is.
      if (atGate) expect(beat.ack).toBe(false);
      if (worked && !atGate) expect(beat.ack).toBe(true);
    }
  });

  it("never lets a duplicate event id into the tray, the press or the drawer", () => {
    for (const beat of SCENARIO) expect(["away", "chute", "bounced"]).toContain(beat.places["D1"]);
    expect(SCENARIO[SCENARIO.length - 1].places["D1"]).toBe("bounced");
  });

  it("merges a call's create and update only when both are at the press together", () => {
    for (const beat of SCENARIO) {
      if (beat.merged === null) continue;
      const [create, update] = [`C${beat.merged}`, `U${beat.merged}`];
      expect(placesOf(beat, [create, update])).toEqual(["press", "press"]);
    }
    expect(SCENARIO.some((b) => b.merged === 1)).toBe(true);
    expect(SCENARIO.some((b) => b.merged === 2)).toBe(true);
  });

  it("handles an update that arrives before its create (call 2) exactly like the ordered case", () => {
    const updateAlone = SCENARIO.find((b) => b.places["U2"] === "press" && b.places["C2"] !== "press");
    expect(updateAlone).toBeDefined();
    const call2Merged = SCENARIO.find((b) => b.merged === 2)!;
    expect(call2Merged.places["C2"]).toBe("press");
  });

  it("keeps at most two parcels at the press, and never mixes calls there", () => {
    for (const beat of SCENARIO) {
      const atPress = Object.entries(beat.places).filter(([, p]) => p === "press").map(([id]) => id);
      expect(atPress.length).toBeLessThanOrEqual(2);
      const calls = new Set(atPress.map((id) => id.slice(1)));
      expect(calls.size).toBeLessThanOrEqual(1);
    }
  });

  it("never moves a parcel backwards through the desk", () => {
    const order = ["away", "chute", "tray", "press", "drawer"];
    for (const p of PARCELS) {
      let rank = -1;
      for (const beat of SCENARIO) {
        const place = beat.places[p.id];
        if (place === "bounced") continue;
        const r = order.indexOf(place);
        expect(r).toBeGreaterThanOrEqual(rank);
        rank = r;
      }
    }
  });
});

describe("countersOf and readoutOf", () => {
  const last = SCENARIO[SCENARIO.length - 1];

  it("ends with every call stored as one trace and the queue empty", () => {
    expect(countersOf(last)).toEqual({ waiting: 0, observations: 4, traces: 2, rejected: 1 });
  });

  it("counts a merged create and update as one observation", () => {
    const afterFirstCall = SCENARIO.find((b) => b.places["C1"] === "drawer" && b.places["T2"] === "away")!;
    expect(countersOf(afterFirstCall).observations).toBe(2);
    expect(countersOf(afterFirstCall).traces).toBe(1);
  });

  it("never lets stored work or rejections go down while the scenario plays", () => {
    let prev = countersOf(SCENARIO[0]);
    for (const beat of SCENARIO.slice(1)) {
      const now = countersOf(beat);
      expect(now.observations).toBeGreaterThanOrEqual(prev.observations);
      expect(now.traces).toBeGreaterThanOrEqual(prev.traces);
      expect(now.rejected).toBeGreaterThanOrEqual(prev.rejected);
      prev = now;
    }
  });

  it("writes the readout from the same counters", () => {
    expect(readoutOf(last)).toBe("waiting 0, stored 4, rejected 1");
    expect(readoutOf(SCENARIO[0])).toBe("waiting 0, stored 0, rejected 0");
  });
});
