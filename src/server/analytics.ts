import { Prisma } from "@prisma/client";
import type { HeatRow } from "@/lib/heatmap";
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

/**
 * The period `offset` windows before the current one (0 = the last `days` days, 1 = the `days` before that).
 * `until` is open-ended for the current window.
 */
function windowOf(days: number, offset: number): { since: Date; until: Date } {
  const { since: current } = dateRange(days);
  if (offset === 0) return { since: current, until: new Date("9999-12-31T00:00:00Z") };
  const since = new Date(current);
  since.setDate(since.getDate() - days * offset);
  const until = new Date(current);
  until.setDate(until.getDate() - days * (offset - 1));
  return { since, until };
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

export async function getOverviewStats(projectId: string, days: number, offset = 0): Promise<OverviewStats> {
  const { since, until } = windowOf(days, offset);

  const [traceCount, errorTraceCount, costSum, percentiles] = await Promise.all([
    prisma.observation.count({ where: { projectId, parentObservationId: null, startTime: { gte: since, lt: until } } }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(DISTINCT "traceId")::bigint as count
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "level" = 'ERROR' AND "startTime" >= ${since} AND "startTime" < ${until}
    `,
    prisma.observation.aggregate({
      where: { projectId, startTime: { gte: since, lt: until }, totalCost: { not: null } },
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
        WHERE "projectId" = ${projectId} AND "startTime" >= ${since} AND "startTime" < ${until}
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

export interface DailyHealth {
  date: string; // YYYY-MM-DD
  traces: number;
  errorTraces: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

/** Per day: how many traces ran, how many had an ERROR, and the typical and slow trace duration. */
export async function getDailyHealth(projectId: string, days: number): Promise<DailyHealth[]> {
  const { since, buckets } = dateRange(days);
  const rows = await prisma.$queryRaw<
    { day: string; traces: number; errors: number; p50: number | null; p95: number | null }[]
  >`
    WITH per_trace AS (
      SELECT "traceId",
        MIN("startTime") AS started,
        EXTRACT(EPOCH FROM (MAX(COALESCE("endTime", "startTime")) - MIN("startTime"))) * 1000 AS ms,
        bool_or("level" = 'ERROR') AS failed
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "startTime" >= ${since}
      GROUP BY "traceId"
    )
    SELECT to_char(date_trunc('day', started), 'YYYY-MM-DD') AS day,
      count(*)::int AS traces,
      (count(*) FILTER (WHERE failed))::int AS errors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) AS p95
    FROM per_trace
    GROUP BY 1
  `;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return buckets.map((date) => {
    const r = byDay.get(date);
    return { date, traces: r?.traces ?? 0, errorTraces: r?.errors ?? 0, p50Ms: r?.p50 ?? null, p95Ms: r?.p95 ?? null };
  });
}

/** Root observations by ISO weekday and UTC hour, for the "When calls arrive" grid. */
export async function getHourlyHeat(projectId: string, days: number): Promise<HeatRow[]> {
  const { since } = dateRange(days);
  return prisma.$queryRaw<HeatRow[]>`
    SELECT EXTRACT(ISODOW FROM "startTime")::int AS dow,
      EXTRACT(HOUR FROM "startTime")::int AS hour,
      count(*)::int AS count
    FROM "Observation"
    WHERE "projectId" = ${projectId} AND "parentObservationId" IS NULL AND "startTime" >= ${since}
    GROUP BY 1, 2
  `;
}

export interface ModelDay {
  model: string;
  date: string;
  generations: number;
  cost: number;
  errors: number;
}

export interface ModelRow {
  model: string;
  generations: number;
  cost: number;
  prevCost: number;
  errors: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

const MODEL_LIMIT = 6;

/**
 * Per-model figures for the Models tab: one row per model for the table, and one row per model and day for the
 * stacked chart. The six models with the most spend are named; everything else is folded into "Other" so the chart
 * keeps a readable number of colours.
 */
export async function getModelBreakdown(
  projectId: string,
  days: number,
): Promise<{ dates: string[]; daily: ModelDay[]; table: ModelRow[] }> {
  const { since, buckets } = dateRange(days);
  const prev = windowOf(days, 1);

  const [table, perDay, prevCosts] = await Promise.all([
    prisma.$queryRaw<
      { model: string; generations: number; cost: number; errors: number; p50: number | null; p95: number | null }[]
    >`
      SELECT "model",
        count(*)::int AS generations,
        COALESCE(sum("totalCost"), 0)::float8 AS cost,
        (count(*) FILTER (WHERE "level" = 'ERROR'))::int AS errors,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000) AS p95
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "type" = 'GENERATION' AND "model" IS NOT NULL AND "startTime" >= ${since}
      GROUP BY "model"
    `,
    prisma.$queryRaw<{ model: string; day: string; generations: number; cost: number; errors: number }[]>`
      SELECT "model", to_char(date_trunc('day', "startTime"), 'YYYY-MM-DD') AS day,
        count(*)::int AS generations,
        COALESCE(sum("totalCost"), 0)::float8 AS cost,
        (count(*) FILTER (WHERE "level" = 'ERROR'))::int AS errors
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "type" = 'GENERATION' AND "model" IS NOT NULL AND "startTime" >= ${since}
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<{ model: string; cost: number }[]>`
      SELECT "model", COALESCE(sum("totalCost"), 0)::float8 AS cost
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "type" = 'GENERATION' AND "model" IS NOT NULL
        AND "startTime" >= ${prev.since} AND "startTime" < ${prev.until}
      GROUP BY "model"
    `,
  ]);

  const prevByModel = new Map(prevCosts.map((r) => [r.model, r.cost]));
  const ranked = [...table].sort((a, b) => b.cost - a.cost || b.generations - a.generations);
  const named = new Set(ranked.slice(0, MODEL_LIMIT).map((r) => r.model));
  const nameOf = (m: string) => (named.has(m) ? m : "Other");

  const rows: ModelRow[] = ranked.slice(0, MODEL_LIMIT).map((r) => ({
    model: r.model,
    generations: r.generations,
    cost: r.cost,
    prevCost: prevByModel.get(r.model) ?? 0,
    errors: r.errors,
    p50Ms: r.p50,
    p95Ms: r.p95,
  }));
  const rest = ranked.slice(MODEL_LIMIT);
  if (rest.length > 0) {
    rows.push({
      model: "Other",
      generations: rest.reduce((a, r) => a + r.generations, 0),
      cost: rest.reduce((a, r) => a + r.cost, 0),
      prevCost: rest.reduce((a, r) => a + (prevByModel.get(r.model) ?? 0), 0),
      errors: rest.reduce((a, r) => a + r.errors, 0),
      p50Ms: null,
      p95Ms: null,
    });
  }

  const folded = new Map<string, ModelDay>();
  for (const r of perDay) {
    const model = nameOf(r.model);
    const key = `${model}|${r.day}`;
    const cur = folded.get(key) ?? { model, date: r.day, generations: 0, cost: 0, errors: 0 };
    cur.generations += r.generations;
    cur.cost += r.cost;
    cur.errors += r.errors;
    folded.set(key, cur);
  }
  return { dates: buckets, daily: [...folded.values()], table: rows };
}

/**
 * The `metadata.gateway` object of the most recent calls that passed through the gateway, newest first, optionally
 * for one model. `total` is how many such calls exist in the period, so the page can say when it read only some.
 */
export async function getGatewayCalls(
  projectId: string,
  days: number,
  model: string | null,
  limit = 5000,
): Promise<{ gateways: unknown[]; total: number }> {
  const { since } = dateRange(days);
  const modelFilter = model ? Prisma.sql`AND "model" = ${model}` : Prisma.empty;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<{ gateway: unknown }[]>`
      SELECT "metadata"->'gateway' AS gateway
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "type" = 'GENERATION' AND "startTime" >= ${since}
        AND "metadata"->'gateway'->'timingMs' IS NOT NULL ${modelFilter}
      ORDER BY "startTime" DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM "Observation"
      WHERE "projectId" = ${projectId} AND "type" = 'GENERATION' AND "startTime" >= ${since}
        AND "metadata"->'gateway'->'timingMs' IS NOT NULL ${modelFilter}
    `,
  ]);
  return { gateways: rows.map((r) => r.gateway), total: count[0]?.n ?? 0 };
}

/** Models that have gateway-timed calls in the period, most calls first, for the tabs on the Gateway page. */
export async function getGatewayModels(
  projectId: string,
  days: number,
): Promise<{ model: string; calls: number; cost: number }[]> {
  const { since } = dateRange(days);
  return prisma.$queryRaw<{ model: string; calls: number; cost: number }[]>`
    SELECT "model", count(*)::int AS calls, COALESCE(sum("totalCost"), 0)::float8 AS cost
    FROM "Observation"
    WHERE "projectId" = ${projectId} AND "type" = 'GENERATION' AND "model" IS NOT NULL AND "startTime" >= ${since}
      AND "metadata"->'gateway'->'timingMs' IS NOT NULL
    GROUP BY "model"
    ORDER BY calls DESC
    LIMIT 8
  `;
}
