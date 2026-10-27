// Read-only queries for the signed-in home page. Nothing here writes, and nothing needs a schema change:
// everything is counted or selected from rows the app already stores.
import { Prisma } from "@prisma/client";
import { parseGatewayTiming, type GatewayTiming } from "@/lib/gatewayTiming";
import type { SetupProgress } from "@/lib/setupProgress";
import { prisma } from "./db";

export interface WorkspaceSummary {
  projects: number;
  traces7d: number;
  gatewayCalls7d: number;
}

export interface LatestCall {
  projectId: string;
  projectName: string;
  traceId: string;
  model: string | null;
  startTime: Date | null;
  timing: GatewayTiming;
}

export interface HomeData {
  summary: WorkspaceSummary;
  progress: SetupProgress;
  /** The newest generation, across the user's projects, that the gateway measured. Null if there is none. */
  latest: LatestCall | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the home page shows about the user's own data. `projects` are the ones they belong to. */
export async function getHomeData(projects: { id: string; name: string }[]): Promise<HomeData> {
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) {
    return {
      summary: { projects: 0, traces7d: 0, gatewayCalls7d: 0 },
      progress: { projects: 0, apiKeys: 0, traces: 0, gatewayCalls: 0 },
      latest: null,
    };
  }

  const since = new Date(Date.now() - 7 * DAY_MS);
  const idList = Prisma.join(ids);

  const [apiKeys, traces, traces7d, gatewayCalls, gatewayCalls7d, latestRows] = await Promise.all([
    prisma.apiKey.count({ where: { projectId: { in: ids } } }),
    prisma.observation.count({ where: { projectId: { in: ids }, parentObservationId: null } }),
    prisma.observation.count({ where: { projectId: { in: ids }, parentObservationId: null, startTime: { gte: since } } }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "Observation"
      WHERE "projectId" IN (${idList}) AND type = 'GENERATION' AND metadata->'gateway'->'timingMs' IS NOT NULL`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "Observation"
      WHERE "projectId" IN (${idList}) AND type = 'GENERATION' AND metadata->'gateway'->'timingMs' IS NOT NULL
        AND "startTime" >= ${since}`,
    prisma.$queryRaw<{ projectId: string; traceId: string; model: string | null; startTime: Date | null; metadata: unknown }[]>`
      SELECT "projectId", "traceId", model, "startTime", metadata FROM "Observation"
      WHERE "projectId" IN (${idList}) AND type = 'GENERATION' AND metadata->'gateway'->'timingMs' IS NOT NULL
      ORDER BY "startTime" DESC NULLS LAST LIMIT 1`,
  ]);

  const row = latestRows[0];
  const timing = row ? parseGatewayTiming(row.metadata) : null;
  const latest: LatestCall | null =
    row && timing
      ? {
          projectId: row.projectId,
          projectName: projects.find((p) => p.id === row.projectId)?.name ?? "Project",
          traceId: row.traceId,
          model: row.model,
          startTime: row.startTime,
          timing,
        }
      : null;

  return {
    summary: { projects: ids.length, traces7d, gatewayCalls7d: Number(gatewayCalls7d[0]?.n ?? 0) },
    progress: { projects: ids.length, apiKeys, traces, gatewayCalls: Number(gatewayCalls[0]?.n ?? 0) },
    latest,
  };
}
