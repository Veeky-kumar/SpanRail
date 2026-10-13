"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { isDeterministicScorerName } from "@/server/scorers";
import { requireSessionProjectMember } from "@/server/projects";

export async function createDatasetAction(projectId: string, formData: FormData) {
  await requireSessionProjectMember(projectId);

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const scorers = formData.getAll("scorers").map(String).filter(isDeterministicScorerName);
  if (!name) throw new Error("Name is required");

  await prisma.dataset.create({ data: { projectId, name, description, scorers } });
  revalidatePath(`/projects/${projectId}/datasets`);
}

export async function addDatasetItemAction(projectId: string, datasetId: string, formData: FormData) {
  await requireSessionProjectMember(projectId);

  const inputText = String(formData.get("input") ?? "");
  const expectedOutputText = String(formData.get("expectedOutput") ?? "").trim();
  if (!inputText.trim()) throw new Error("Input is required");

  await prisma.datasetItem.create({
    data: {
      projectId,
      datasetId,
      input: parseMaybeJson(inputText),
      expectedOutput: expectedOutputText ? parseMaybeJson(expectedOutputText) : undefined,
    },
  });
  revalidatePath(`/projects/${projectId}/datasets/${datasetId}`);
}

export async function createDatasetRunAction(projectId: string, datasetId: string, formData: FormData) {
  await requireSessionProjectMember(projectId);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  await prisma.datasetRun.create({ data: { projectId, datasetId, name } });
  revalidatePath(`/projects/${projectId}/datasets/${datasetId}`);
}

function parseMaybeJson(text: string): object {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
