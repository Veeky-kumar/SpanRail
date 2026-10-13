"use server";

import { revalidatePath } from "next/cache";
import { createPromptVersion } from "@/server/prompts";
import { requireSessionProjectMember } from "@/server/projects";

export async function createPromptVersionAction(projectId: string, formData: FormData) {
  await requireSessionProjectMember(projectId);

  const name = String(formData.get("name") ?? "").trim();
  const promptText = String(formData.get("prompt") ?? "");
  const labelsRaw = String(formData.get("labels") ?? "");
  const labels = labelsRaw
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!name || !promptText) {
    throw new Error("Name and prompt text are required");
  }

  await createPromptVersion({
    projectId,
    name,
    type: "TEXT",
    prompt: promptText,
    labels,
  });

  revalidatePath(`/projects/${projectId}/prompts`);
  revalidatePath(`/projects/${projectId}/prompts/${encodeURIComponent(name)}`);
}
