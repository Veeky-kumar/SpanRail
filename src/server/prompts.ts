import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

export const LATEST_LABEL = "latest";
export const PRODUCTION_LABEL = "production";

export interface CreatePromptVersionInput {
  projectId: string;
  name: string;
  type: "TEXT" | "CHAT";
  prompt: Prisma.InputJsonValue;
  labels?: string[];
  config?: Prisma.InputJsonValue;
  tags?: string[];
}

/**
 * Creates a new immutable version and atomically moves any of the requested labels off
 * whichever older version currently holds them. See ARCHITECTURE.md, "Prompt
 * management", for why labels move inside the same transaction as the insert.
 */
export async function createPromptVersion(input: CreatePromptVersionInput) {
  const labels = Array.from(new Set([...(input.labels ?? []), LATEST_LABEL]));

  return prisma.$transaction(async (tx) => {
    const current = await tx.prompt.findFirst({
      where: { projectId: input.projectId, name: input.name },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (current?.version ?? 0) + 1;

    const holders = await tx.prompt.findMany({
      where: { projectId: input.projectId, name: input.name, labels: { hasSome: labels } },
      select: { id: true, labels: true },
    });
    for (const holder of holders) {
      const remaining = holder.labels.filter((l) => !labels.includes(l));
      if (remaining.length !== holder.labels.length) {
        await tx.prompt.update({ where: { id: holder.id }, data: { labels: remaining } });
      }
    }

    return tx.prompt.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        version,
        type: input.type,
        prompt: input.prompt,
        labels,
        config: input.config ?? undefined,
        tags: input.tags ?? [],
      },
    });
  });
}

export async function listPromptNames(projectId: string) {
  const prompts = await prisma.prompt.findMany({
    where: { projectId },
    orderBy: [{ name: "asc" }, { version: "desc" }],
  });
  const byName = new Map<string, typeof prompts>();
  for (const p of prompts) {
    const list = byName.get(p.name) ?? [];
    list.push(p);
    byName.set(p.name, list);
  }
  return Array.from(byName.entries()).map(([name, versions]) => ({
    name,
    latest: versions[0],
    versionCount: versions.length,
  }));
}

export async function listPromptVersions(projectId: string, name: string) {
  return prisma.prompt.findMany({
    where: { projectId, name },
    orderBy: { version: "desc" },
  });
}
