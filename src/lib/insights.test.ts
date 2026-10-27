import { describe, expect, it } from "vitest";
import { modelInsights, type ModelPeriod } from "./insights";

const m = (model: string, cost: number, prevCost: number, generations = 100, errors = 0): ModelPeriod => ({
  model,
  cost,
  prevCost,
  generations,
  errors,
});

describe("modelInsights", () => {
  it("names the model whose spend moved the most in dollars", () => {
    const out = modelInsights([m("small", 2, 1), m("big", 80, 60), m("mid", 10, 10)]);
    expect(out[0].head).toBe("big moved the most.");
    expect(out[0].body).toContain("up 33%");
    expect(out[0].body).toContain("$20.00 more");
  });

  it("says so when a model had no spend before", () => {
    expect(modelInsights([m("new", 5, 0)])[0].body).toContain("nothing in the one before");
  });

  it("flags a bill dominated by two models", () => {
    const out = modelInsights([m("a", 50, 50), m("b", 30, 30), m("c", 10, 10), m("d", 10, 10)]);
    expect(out.some((i) => i.head === "Two models are 80% of spend.")).toBe(true);
  });

  it("flags a model that fails much more often than the rest, but only with enough calls", () => {
    const flagged = modelInsights([m("ok", 5, 5, 1000, 5), m("flaky", 5, 5, 200, 30)]);
    expect(flagged.some((i) => i.head === "flaky fails most often.")).toBe(true);
    const tooFew = modelInsights([m("ok", 5, 5, 1000, 5), m("flaky", 5, 5, 10, 5)]);
    expect(tooFew.some((i) => i.head.includes("fails"))).toBe(false);
  });

  it("returns nothing for no data", () => {
    expect(modelInsights([])).toEqual([]);
  });
});
