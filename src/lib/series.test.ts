import { describe, expect, it } from "vitest";
import { linePath, niceMax, pctChange, sparkPath } from "./series";

describe("pctChange", () => {
  it("is a fraction of the previous value", () => {
    expect(pctChange(110, 100)).toBeCloseTo(0.1);
    expect(pctChange(50, 100)).toBeCloseTo(-0.5);
  });
  it("is null with nothing to compare to", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(Number.NaN, 3)).toBeNull();
  });
});

describe("linePath", () => {
  it("starts with M and continues with L", () => {
    expect(linePath([[0, 1], [2, 3]])).toBe("M0.0 1.0 L2.0 3.0");
    expect(linePath([])).toBe("");
  });
});

describe("sparkPath", () => {
  it("puts the lowest value at the bottom and the highest at the top", () => {
    expect(sparkPath([1, 3], 100, 20, 2)).toBe("M0.0 18.0 L100.0 2.0");
  });
  it("draws a flat series in the middle", () => {
    expect(sparkPath([4, 4, 4], 100, 20)).toBe("M0.0 10.0 L50.0 10.0 L100.0 10.0");
  });
  it("handles one point and no points", () => {
    expect(sparkPath([7], 10, 10)).toBe("M0.0 5.0 L10.0 5.0");
    expect(sparkPath([], 10, 10)).toBe("");
  });
});

describe("niceMax", () => {
  it("rounds up to 1, 2, 2.5, 5 or 10 times a power of ten", () => {
    expect(niceMax(0.7)).toBe(1);
    expect(niceMax(1.2)).toBe(2);
    expect(niceMax(2.3)).toBe(2.5);
    expect(niceMax(4100)).toBe(5000);
    expect(niceMax(7000)).toBe(10000);
  });
  it("never returns zero or less", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
  });
});
