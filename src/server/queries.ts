import { prisma } from "./db";

export async function getProject(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId } });
}

export interface TraceSummary {
  traceId: string;
  rootId: string;
  name: string | null;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  startTime: Date | null;
  durationMs: number | null;
  observationCount: number;
  hasError: boolean;
  hasWarning: boolean;
  totalCost: number | null;
}

export async function getProjectTraceSummaries(projectId: string, limit = 50): Promise<TraceSummary[]> {
  const roots = await prisma.observation.findMany({
    where: { projectId, parentObservationId: null },
    orderBy: { startTime: "desc" },
    take: limit,
  });

  if (roots.length === 0) return [];
  const traceIds = roots.map((r) => r.traceId);

  const [aggregates, errorTraceIds, warningTraceIds, costSums] = await Promise.all([
    prisma.observation.groupBy({
      by: ["traceId"],
      where: { projectId, traceId: { in: traceIds } },
      _count: { _all: true },
      _min: { startTime: true },
      _max: { endTime: true, startTime: true },
    }),
    prisma.observation.findMany({
      where: { projectId, traceId: { in: traceIds }, level: "ERROR" },
      select: { traceId: true },
      distinct: ["traceId"],
    }),
    prisma.observation.findMany({
      where: { projectId, traceId: { in: traceIds }, level: "WARNING" },
      select: { traceId: true },
      distinct: ["traceId"],
    }),
    prisma.observation.groupBy({
      by: ["traceId"],
      where: { projectId, traceId: { in: traceIds }, totalCost: { not: null } },
      _sum: { totalCost: true },
    }),
  ]);

  const aggByTrace = new Map(aggregates.map((a) => [a.traceId, a]));
  const errorSet = new Set(errorTraceIds.map((t) => t.traceId));
  const warningSet = new Set(warningTraceIds.map((t) => t.traceId));
  const costByTrace = new Map(costSums.map((c) => [c.traceId, c._sum.totalCost]));

  return roots.map((root) => {
    const agg = aggByTrace.get(root.traceId);
    const start = agg?._min.startTime ?? root.startTime ?? null;
    const end = agg?._max.endTime ?? agg?._max.startTime ?? null;
    const durationMs = start && end ? end.getTime() - start.getTime() : null;
    const cost = costByTrace.get(root.traceId);

    return {
      traceId: root.traceId,
      rootId: root.id,
      name: root.traceName ?? root.name,
      userId: root.userId,
      sessionId: root.sessionId,
      tags: root.tags,
      startTime: root.startTime,
      durationMs,
      observationCount: agg?._count._all ?? 1,
      hasError: errorSet.has(root.traceId),
      hasWarning: warningSet.has(root.traceId),
      totalCost: cost ? Number(cost) : null,
    };
  });
}

export async function getTraceObservations(projectId: string, traceId: string) {
  return prisma.observation.findMany({
    where: { projectId, traceId },
    orderBy: { startTime: "asc" },
    include: { scores: true },
  });
}

/**
 * Scores attached to the trace as a whole (SDK `trace.score()`, no `observationId`) have
 * no row to join through via Observation's `scores` relation — found via a break-ui pass:
 * they were being captured correctly but were invisible anywhere in the dashboard.
 * Fetched separately and attached to the root observation for display.
 */
export async function getTraceLevelScores(projectId: string, traceId: string) {
  return prisma.score.findMany({
    where: { projectId, traceId, observationId: null },
    orderBy: { createdAt: "asc" },
  });
}
