import { describe, expect, it } from "vitest";
import { heatMatrix } from "./heatmap";

describe("heatMatrix", () => {
  it("places counts by weekday and hour and tracks the maximum and total", () => {
    const { cells, max, total } = heatMatrix([
      { dow: 1, hour: 9, count: 4 },
      { dow: 7, hour: 23, count: 10 },
      { dow: 1, hour: 9, count: 2 },
    ]);
    expect(cells[0][9]).toBe(6);
    expect(cells[6][23]).toBe(10);
    expect(max).toBe(10);
    expect(total).toBe(16);
  });
  it("ignores out-of-range rows and is all zero when empty", () => {
    expect(heatMatrix([{ dow: 0, hour: 1, count: 3 }, { dow: 2, hour: 24, count: 3 }]).total).toBe(0);
    expect(heatMatrix([]).max).toBe(0);
  });
});
