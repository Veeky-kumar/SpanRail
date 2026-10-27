import { describe, expect, it } from "vitest";
import { SECTIONS, sectionFor } from "./nav";

const label = (path: string, id = "p1") => sectionFor(path, id)?.label ?? null;

describe("sectionFor", () => {
  it("treats the project root and trace pages as Traces", () => {
    expect(label("/projects/p1")).toBe("Traces");
    expect(label("/projects/p1/traces/abc")).toBe("Traces");
  });

  it("maps each top-level section by its first path segment", () => {
    expect(label("/projects/p1/analytics")).toBe("Analytics");
    expect(label("/projects/p1/prompts/greeting")).toBe("Prompts");
    expect(label("/projects/p1/datasets/d1/runs/r1")).toBe("Datasets");
    expect(label("/projects/p1/settings")).toBe("Settings");
  });

  it("returns null outside the project or for an unknown section", () => {
    expect(label("/")).toBeNull();
    expect(label("/login")).toBeNull();
    expect(label("/projects/p1/nope")).toBeNull();
  });

  it("does not match a different project whose id starts with the same characters", () => {
    expect(label("/projects/p12/analytics", "p1")).toBeNull();
    expect(label("/projects/p1x", "p1")).toBeNull();
  });

  it("lists the sections in navigation order", () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(["Traces", "Analytics", "Prompts", "Datasets", "Settings"]);
  });
});
