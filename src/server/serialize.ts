import type { TraceTreeNode } from "./traceTree";

export interface SerializedScore {
  id: string;
  name: string;
  value: number | null;
  stringValue: string | null;
  source: string;
  comment: string | null;
}

export interface SerializedObservation {
  id: string;
  traceId: string;
  parentObservationId: string | null;
  type: string;
  name: string | null;
  startTime: number | null;
  endTime: number | null;
  level: string;
  statusMessage: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
  model: string | null;
  modelParameters: unknown;
  usageDetails: unknown;
  costDetails: unknown;
  totalCost: number | null;
  traceName: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  promptName: string | null;
  promptVersion: number | null;
  scores: SerializedScore[];
}

export interface SerializedTreeNode {
  observation: SerializedObservation;
  depth: number;
  children: SerializedTreeNode[];
}

export function serializeTree(
  nodes: TraceTreeNode[],
  scoresByObsId: Map<string, SerializedScore[]>,
): SerializedTreeNode[] {
  return nodes.map((n) => ({
    depth: n.depth,
    observation: {
      id: n.observation.id,
      traceId: n.observation.traceId,
      parentObservationId: n.observation.parentObservationId,
      type: n.observation.type,
      name: n.observation.name,
      startTime: n.observation.startTime?.getTime() ?? null,
      endTime: n.observation.endTime?.getTime() ?? null,
      level: n.observation.level,
      statusMessage: n.observation.statusMessage,
      input: n.observation.input,
      output: n.observation.output,
      metadata: n.observation.metadata,
      model: n.observation.model,
      modelParameters: n.observation.modelParameters,
      usageDetails: n.observation.usageDetails,
      costDetails: n.observation.costDetails,
      totalCost: n.observation.totalCost ? Number(n.observation.totalCost) : null,
      traceName: n.observation.traceName,
      userId: n.observation.userId,
      sessionId: n.observation.sessionId,
      tags: n.observation.tags,
      promptName: n.observation.promptName,
      promptVersion: n.observation.promptVersion,
      scores: scoresByObsId.get(n.observation.id) ?? [],
    },
    children: serializeTree(n.children, scoresByObsId),
  }));
}
