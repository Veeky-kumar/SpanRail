import { describe, it, expect } from "vitest";
import { formatCompactNumber, formatCompactCurrency, formatPercent } from "./chartFormat";

describe("formatCompactNumber", () => {
  it("leaves small numbers as plain comma-grouped integers", () => {
    expect(formatCompactNumber(0)).toBe("0");
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1284)).toBe("1,284");
  });

  it("compacts thousands with a K suffix starting at 10,000", () => {
    expect(formatCompactNumber(12_900)).toBe("12.9K");
    expect(formatCompactNumber(10_000)).toBe("10K");
    expect(formatCompactNumber(9999)).toBe("9,999");
  });

  it("compacts millions with an M suffix", () => {
    expect(formatCompactNumber(4_200_000)).toBe("4.2M");
  });
});

describe("formatCompactCurrency", () => {
  it("shows zero plainly", () => {
    expect(formatCompactCurrency(0)).toBe("$0");
  });

  it("uses extra precision for sub-cent costs (the common case for LLM calls)", () => {
    expect(formatCompactCurrency(0.000103)).toBe("$0.00010");
  });

  it("uses normal 2-decimal currency formatting for everyday amounts", () => {
    expect(formatCompactCurrency(4.2)).toBe("$4.20");
  });

  it("compacts large totals the same way as formatCompactNumber", () => {
    expect(formatCompactCurrency(4_200_000)).toBe("$4.2M");
  });
});

describe("formatPercent", () => {
  it("converts a 0..1 fraction to a one-decimal percentage", () => {
    expect(formatPercent(0.667)).toBe("66.7%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });
});
