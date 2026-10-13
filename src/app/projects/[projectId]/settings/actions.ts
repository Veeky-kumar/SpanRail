"use server";

import { revalidatePath } from "next/cache";
import { requireSessionProjectMember } from "@/server/projects";
import { createApiKey } from "@/server/apiKeys";

export interface CreateApiKeyState {
  publicKey?: string;
  secretKey?: string;
  error?: string;
}

export async function createApiKeyAction(
  projectId: string,
  _prevState: CreateApiKeyState,
  _formData: FormData,
): Promise<CreateApiKeyState> {
  await requireSessionProjectMember(projectId);

  const { publicKey, secretKey } = await createApiKey(projectId);
  revalidatePath(`/projects/${projectId}/settings`);
  return { publicKey, secretKey };
}
