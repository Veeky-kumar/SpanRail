import { describe, expect, it } from "vitest";
import { doneCount, nextStepOf, setupSteps, type SetupProgress } from "./setupProgress";

const none: SetupProgress = { projects: 0, apiKeys: 0, traces: 0, gatewayCalls: 0 };

describe("setupSteps", () => {
  it("lists the four steps in the order a newcomer takes them", () => {
    expect(setupSteps(none, null).map((s) => s.id)).toEqual(["project", "api-key", "first-trace", "gateway-call"]);
  });

  it("marks nothing done for a brand-new workspace", () => {
    expect(setupSteps(none, null).every((s) => !s.done)).toBe(true);
    expect(doneCount(setupSteps(none, null))).toBe(0);
  });

  it("derives each step from the matching count, not from the steps before it", () => {
    const steps = setupSteps({ projects: 1, apiKeys: 0, traces: 3, gatewayCalls: 0 }, "p1");
    expect(Object.fromEntries(steps.map((s) => [s.id, s.done]))).toEqual({
      project: true,
      "api-key": false,
      "first-trace": true,
      "gateway-call": false,
    });
  });

  it("links the steps that live inside a project to the first project, and only when one exists", () => {
    const withProject = setupSteps({ ...none, projects: 1 }, "p1");
    expect(withProject.find((s) => s.id === "api-key")!.href).toBe("/projects/p1/settings");
    expect(withProject.find((s) => s.id === "first-trace")!.href).toBe("/projects/p1");
    const without = setupSteps(none, null);
    expect(without.find((s) => s.id === "api-key")!.href).toBeUndefined();
    expect(without.find((s) => s.id === "project")!.href).toBe("#projects");
  });

  it("does not put a project id into a link unescaped", () => {
    const steps = setupSteps({ ...none, projects: 1 }, "a/b?c");
    expect(steps.find((s) => s.id === "api-key")!.href).toBe("/projects/a%2Fb%3Fc/settings");
  });
});

describe("nextStepOf and doneCount", () => {
  it("points at the first step that is not done", () => {
    expect(nextStepOf(setupSteps({ projects: 1, apiKeys: 0, traces: 0, gatewayCalls: 0 }, "p1"))?.id).toBe("api-key");
  });

  it("returns null when everything is done", () => {
    const all = setupSteps({ projects: 2, apiKeys: 1, traces: 9, gatewayCalls: 4 }, "p1");
    expect(nextStepOf(all)).toBeNull();
    expect(doneCount(all)).toBe(4);
  });
});
