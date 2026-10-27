import { describe, expect, it } from "vitest";
import { layoutTreemap } from "./treemap";

describe("layoutTreemap", () => {
  it("fills the box exactly, with each tile's area in proportion to its value", () => {
    const items = [
      { key: "a", value: 50 },
      { key: "b", value: 30 },
      { key: "c", value: 15 },
      { key: "d", value: 5 },
    ];
    const tiles = layoutTreemap(items, 400, 300);
    const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(area).toBeCloseTo(400 * 300, 3);
    for (const t of tiles) {
      expect((t.w * t.h) / (400 * 300)).toBeCloseTo(t.value / 100, 3);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(400 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(300 + 1e-6);
    }
  });
  it("drops zero values and handles empty input", () => {
    expect(layoutTreemap([], 10, 10)).toEqual([]);
    expect(layoutTreemap([{ key: "z", value: 0 }], 10, 10)).toEqual([]);
    expect(layoutTreemap([{ key: "a", value: 3 }], 10, 20)).toEqual([{ key: "a", value: 3, x: 0, y: 0, w: 10, h: 20 }]);
  });
});
