import { prisma } from "./db";

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function dateRange(days: number): { since: Date; buckets: string[] } {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const buckets: string[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < days; i++) {
    buckets.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return { since, buckets };
}

function fillBuckets(buckets: string[], rows: { day: string; value: number }[]): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  return buckets.map((date) => ({ date, value: byDay.get(date) ?? 0 }));
}

/** Daily count of traces (root observations) started in the period. */
export async function getDailyTraceVolume(projectId: string, days: number): Promise<DailyPoint[]> {
  const { since, buckets } = dateRange(days);
  const rows = await prisma.$queryRaw<{ day: string; value: bigint }[]>`
    SELECT to_char(date_trunc('day', "startTime"), 'YYYY-MM-DD') as day, count(*)::bigint as value
    FROM "Observation"
    WHERE "projectId" = ${projectId} AND "parentObservationId" IS NULL AND "startTime" >= ${since}
    GROUP BY 1
  `;
  return fillBuckets(buckets, rows.map((r) => ({ day: r.day, value: Number(r.value) })));
}

/** Daily sum of observation cost across the whole project (not just roots). */
export async function getDailyCost(projectId: string, days: number): Promise<DailyPoint[]> {
  const { since, buckets } = dateRange(days);
  const rows = await prisma.$queryRaw<{ day: string; value: number }[]>`
    SELECT to_char(date_trunc('day', "startTime"), 'YYYY-MM-DD') as day, COALESCE(sum("totalCost"), 0)::float8 as value
    FROM "Observation"
    WHERE "projectId" = ${projectId} AND "startTime" >= ${since} AND "totalCost" IS NOT NULL
    GROUP BY 1
  `;
  return fillBuckets(buckets, rows);
}

export interface ModelUsage {
  model: string;
  generationCount: number;
  totalCost: number;
}

/** Top models by generation count over the period. */
export async function getTopModels(projectId: string, days: number, limit = 8): Promise<ModelUsage[]> {
  const { since } = dateRange(days);
  const rows = await prisma.observation.groupBy({
    by: ["model"],
    where: { projectId, type: "GENERATION", model: { not: null }, startTime: { gte: since } },
    _count: { _all: true },
    _sum: { totalCost: true },
    orderBy: { _count: { model: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({
    model: r.model ?? "unknown",
    generationCount: r._count._all,
    totalCost: r._sum.totalCost ? Number(r._sum.totalCost) : 0,
  }));
}

export interface OverviewStats {
  traceCount: number;
  errorRate: number; // 0..1, share of traces with >=1 ERROR-level observation
  totalCost: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

export async function getOverviewStats(projectId: string, days: number): Promise<OverviewStats> {
  const { since } = dateRange(days);

  const [traceCount, errorTraceCount, costSum, percentiles] = await Promise.all([
    prisma.observation.count({ where: { projectId, parentObservationId: null, startTime: { gte: since } } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(DISTINCT "traceId")::bigint as count
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "level" = 'ERROR' AND "startTime" >= ${since}
    `,
    prisma.observation.aggregate({
      where: { projectId, startTime: { gte: since }, totalCost: { not: null } },
      _sum: { totalCost: true },
    }),
    // Native percentile_cont for honest percentiles rather than an in-app approximation
    // over a fetched-and-sorted array — this is the kind of query Postgres is actually
    // good at (see ARCHITECTURE.md on the Postgres-only MVP storage decision).
    prisma.$queryRaw<{ p50: number | null; p95: number | null }[]>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) as p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95
      FROM (
        SELECT EXTRACT(EPOCH FROM (MAX(COALESCE("endTime", "startTime")) - MIN("startTime"))) * 1000 as duration_ms
        FROM "Observation"
        WHERE "projectId" = ${projectId} AND "startTime" >= ${since}
        GROUP BY "traceId"
      ) per_trace
      WHERE duration_ms IS NOT NULL
    `,
  ]);

  return {
    traceCount,
    errorRate: traceCount > 0 ? Number(errorTraceCount[0]?.count ?? 0) / traceCount : 0,
    totalCost: costSum._sum.totalCost ? Number(costSum._sum.totalCost) : 0,
    p50LatencyMs: percentiles[0]?.p50 ?? null,
    p95LatencyMs: percentiles[0]?.p95 ?? null,
  };
}
