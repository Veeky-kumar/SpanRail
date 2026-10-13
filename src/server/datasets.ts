import { prisma } from "./db";

export async function listDatasets(projectId: string) {
  return prisma.dataset.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true, runs: true } } },
  });
}

export async function getDataset(projectId: string, datasetId: string) {
  return prisma.dataset.findFirst({ where: { id: datasetId, projectId } });
}

export async function getDatasetItems(projectId: string, datasetId: string) {
  return prisma.datasetItem.findMany({ where: { projectId, datasetId }, orderBy: { createdAt: "asc" } });
}

export async function getDatasetRuns(projectId: string, datasetId: string) {
  return prisma.datasetRun.findMany({
    where: { projectId, datasetId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
}

export interface ScorerSummary {
  name: string;
  passCount: number;
  totalCount: number;
  passRate: number;
}

/** Aggregate per-scorer pass rate for a run — the basis for spotting a regression between two runs. */
export async function getRunScoreSummary(projectId: string, datasetRunId: string): Promise<ScorerSummary[]> {
  const runItems = await prisma.datasetRunItem.findMany({
    where: { projectId, datasetRunId },
    select: { observationId: true },
  });
  const observationIds = runItems.map((i) => i.observationId).filter((id): id is string => id !== null);
  if (observationIds.length === 0) return [];

  const scores = await prisma.score.findMany({
    where: { projectId, observationId: { in: observationIds }, source: "EVAL" },
    select: { name: true, value: true },
  });

  const byName = new Map<string, { pass: number; total: number }>();
  for (const s of scores) {
    const entry = byName.get(s.name) ?? { pass: 0, total: 0 };
    entry.total += 1;
    if ((s.value ?? 0) >= 1) entry.pass += 1;
    byName.set(s.name, entry);
  }

  return Array.from(byName.entries()).map(([name, { pass, total }]) => ({
    name,
    passCount: pass,
    totalCount: total,
    passRate: total > 0 ? pass / total : 0,
  }));
}

export async function getRunItemsDetailed(projectId: string, datasetRunId: string) {
  const runItems = await prisma.datasetRunItem.findMany({
    where: { projectId, datasetRunId },
    orderBy: { createdAt: "asc" },
  });

  const observationIds = runItems.map((i) => i.observationId).filter((id): id is string => id !== null);
  const [observations, scores] = await Promise.all([
    prisma.observation.findMany({ where: { projectId, id: { in: observationIds } } }),
    prisma.score.findMany({ where: { projectId, observationId: { in: observationIds } } }),
  ]);
  const obsById = new Map(observations.map((o) => [o.id, o]));
  const scoresByObsId = new Map<string, typeof scores>();
  for (const s of scores) {
    if (!s.observationId) continue;
    const list = scoresByObsId.get(s.observationId) ?? [];
    list.push(s);
    scoresByObsId.set(s.observationId, list);
  }

  return runItems.map((item) => ({
    ...item,
    observation: item.observationId ? obsById.get(item.observationId) ?? null : null,
    scores: item.observationId ? scoresByObsId.get(item.observationId) ?? [] : [],
  }));
}
