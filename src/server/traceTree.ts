import type { Observation } from "@prisma/client";

export interface TraceTreeNode {
  observation: Observation;
  depth: number;
  children: TraceTreeNode[];
}

/**
 * Builds a nested tree from a flat list of observations belonging to one trace.
 * Rules (see ARCHITECTURE.md): a node whose parent is missing or unresolved within this
 * trace is promoted to root rather than dropped, siblings are ordered by start time,
 * and any observation unreachable from a root (malformed/cyclic data) is still
 * surfaced rather than silently lost.
 */
export function buildObservationTree(observations: Observation[]): TraceTreeNode[] {
  const byId = new Map(observations.map((o) => [o.id, o]));
  const childrenByParent = new Map<string, Observation[]>();
  const roots: Observation[] = [];

  for (const obs of observations) {
    const parentId = obs.parentObservationId;
    if (parentId && byId.has(parentId) && parentId !== obs.id) {
      const list = childrenByParent.get(parentId) ?? [];
      list.push(obs);
      childrenByParent.set(parentId, list);
    } else {
      roots.push(obs);
    }
  }

  const byStartTime = (a: Observation, b: Observation) => {
    const ta = a.startTime?.getTime() ?? 0;
    const tb = b.startTime?.getTime() ?? 0;
    return ta - tb;
  };

  const visited = new Set<string>();

  function walk(obs: Observation, depth: number): TraceTreeNode {
    visited.add(obs.id);
    const children = (childrenByParent.get(obs.id) ?? []).sort(byStartTime);
    return {
      observation: obs,
      depth,
      children: children.map((c) => walk(c, depth + 1)),
    };
  }

  const tree = roots.sort(byStartTime).map((r) => walk(r, 0));

  // Cycle guard: anything never visited (e.g. a parent-cycle) is still surfaced,
  // appended at depth 0, rather than silently dropped.
  const unreached = observations.filter((o) => !visited.has(o.id)).sort(byStartTime);
  for (const o of unreached) {
    tree.push({ observation: o, depth: 0, children: [] });
  }

  return tree;
}

export function flattenTree(nodes: TraceTreeNode[]): TraceTreeNode[] {
  const out: TraceTreeNode[] = [];
  function walk(n: TraceTreeNode) {
    out.push(n);
    for (const c of n.children) walk(c);
  }
  for (const n of nodes) walk(n);
  return out;
}
