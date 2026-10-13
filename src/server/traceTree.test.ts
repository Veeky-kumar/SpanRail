import { describe, it, expect } from "vitest";
import type { Observation } from "@prisma/client";
import { buildObservationTree, flattenTree } from "./traceTree";

function fakeObservation(overrides: Partial<Observation> & { id: string }): Observation {
  return {
    projectId: "proj_1",
    traceId: "trace_1",
    parentObservationId: null,
    type: "SPAN",
    name: overrides.id,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: null,
    level: "DEFAULT",
    statusMessage: null,
    input: null,
    output: null,
    metadata: null,
    model: null,
    modelParameters: null,
    providedUsageDetails: null,
    usageDetails: null,
    providedCostDetails: null,
    costDetails: null,
    totalCost: null,
    traceName: null,
    userId: null,
    sessionId: null,
    tags: [],
    promptId: null,
    promptName: null,
    promptVersion: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Observation;
}

function at(iso: string) {
  return new Date(`2026-01-01T${iso}.000Z`);
}

describe("buildObservationTree", () => {
  it("builds a simple parent-child-grandchild chain with increasing depth", () => {
    const root = fakeObservation({ id: "root", startTime: at("00:00:00") });
    const child = fakeObservation({ id: "child", parentObservationId: "root", startTime: at("00:00:01") });
    const grandchild = fakeObservation({ id: "grandchild", parentObservationId: "child", startTime: at("00:00:02") });

    const tree = buildObservationTree([grandchild, root, child]); // scrambled input order

    expect(tree).toHaveLength(1);
    expect(tree[0].observation.id).toBe("root");
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].observation.id).toBe("child");
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].observation.id).toBe("grandchild");
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("orders siblings by startTime regardless of input array order", () => {
    const root = fakeObservation({ id: "root", startTime: at("00:00:00") });
    const second = fakeObservation({ id: "second", parentObservationId: "root", startTime: at("00:00:05") });
    const first = fakeObservation({ id: "first", parentObservationId: "root", startTime: at("00:00:01") });

    const tree = buildObservationTree([root, second, first]);

    expect(tree[0].children.map((c) => c.observation.id)).toEqual(["first", "second"]);
  });

  it("promotes an observation to root when its declared parent is missing from the set", () => {
    // Simulates out-of-order ingestion: the child's parent event hasn't landed yet.
    const orphan = fakeObservation({ id: "orphan", parentObservationId: "never-arrives", startTime: at("00:00:01") });

    const tree = buildObservationTree([orphan]);

    expect(tree).toHaveLength(1);
    expect(tree[0].observation.id).toBe("orphan");
    expect(tree[0].depth).toBe(0);
  });

  it("treats a self-referencing parentObservationId as a root, not an infinite self-loop", () => {
    const selfParent = fakeObservation({ id: "weird", parentObservationId: "weird", startTime: at("00:00:01") });

    const tree = buildObservationTree([selfParent]);

    expect(tree).toHaveLength(1);
    expect(tree[0].observation.id).toBe("weird");
    expect(tree[0].children).toHaveLength(0);
  });

  it("surfaces a mutual parent-cycle instead of dropping both nodes", () => {
    const a = fakeObservation({ id: "a", parentObservationId: "b", startTime: at("00:00:01") });
    const b = fakeObservation({ id: "b", parentObservationId: "a", startTime: at("00:00:02") });

    const tree = buildObservationTree([a, b]);

    // Neither resolves as a normal root (each has a parent present in the set), so both
    // must come back via the cycle guard rather than vanish.
    const ids = flattenTree(tree).map((n) => n.observation.id);
    expect(ids.sort()).toEqual(["a", "b"]);
  });

  it("handles an empty list without throwing", () => {
    expect(buildObservationTree([])).toEqual([]);
  });

  it("orders multiple root traces' top-level siblings by startTime", () => {
    const later = fakeObservation({ id: "later-root", startTime: at("00:00:10") });
    const earlier = fakeObservation({ id: "earlier-root", startTime: at("00:00:01") });

    const tree = buildObservationTree([later, earlier]);

    expect(tree.map((n) => n.observation.id)).toEqual(["earlier-root", "later-root"]);
  });
});
