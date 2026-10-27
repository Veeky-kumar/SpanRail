import { describe, expect, it } from "vitest";
import { PARCELS, SCENARIO } from "./model";
import { BASE_BOUNDS, poseOf } from "./layout";

describe("poseOf", () => {
  it("keeps every visible parcel on the desk", () => {
    for (const beat of SCENARIO) {
      for (const p of PARCELS) {
        const pose = poseOf(beat, p.id);
        if (!pose.visible) continue;
        expect(pose.x).toBeGreaterThan(BASE_BOUNDS.x0);
        expect(pose.x).toBeLessThan(BASE_BOUNDS.x1);
        expect(pose.y).toBeGreaterThan(BASE_BOUNDS.y0);
        expect(pose.y).toBeLessThan(BASE_BOUNDS.y1);
        expect(pose.z).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("hides a parcel exactly while it is away", () => {
    for (const beat of SCENARIO) {
      for (const p of PARCELS) expect(poseOf(beat, p.id).visible).toBe(beat.places[p.id] !== "away");
    }
  });

  it("never puts two parcels in the same spot (a merged create and update sit side by side, and stack)", () => {
    for (const beat of SCENARIO) {
      const poses = PARCELS.map((p) => ({ id: p.id, ...poseOf(beat, p.id) })).filter((p) => p.visible);
      for (let i = 0; i < poses.length; i++) {
        for (let j = i + 1; j < poses.length; j++) {
          const a = poses[i];
          const b = poses[j];
          const apart = Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.z - b.z) > 0.5;
          expect(apart, `${a.id} and ${b.id} overlap in beat "${beat.title}"`).toBe(true);
        }
      }
    }
  });

  it("stacks stored parcels upwards in the order they were filed", () => {
    const last = SCENARIO[SCENARIO.length - 1];
    const stored = PARCELS.filter((p) => last.places[p.id] === "drawer").map((p) => poseOf(last, p.id).z);
    const sorted = [...stored].sort((a, b) => a - b);
    expect(stored).toEqual(sorted);
    expect(new Set(stored).size).toBe(stored.length);
  });

  it("puts a turned-away duplicate at the reject tray, away from the work", () => {
    const beat = SCENARIO.find((b) => b.places["D1"] === "bounced")!;
    const pose = poseOf(beat, "D1");
    expect(pose.visible).toBe(true);
    expect(pose.y).toBeGreaterThan(40);
  });

  it("moves a parcel to the press as one piece, and a merged pair as two layers", () => {
    const merged = SCENARIO.find((b) => b.merged === 1)!;
    const c = poseOf(merged, "C1");
    const u = poseOf(merged, "U1");
    expect(u.z).toBeGreaterThan(c.z);
    expect(Math.abs(u.x - c.x)).toBeLessThan(8);
  });
});
