import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authenticateApiKey } from "@/server/apiKeyAuth";
import { createPromptVersion } from "@/server/prompts";

const CreatePromptSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["TEXT", "CHAT"]).default("TEXT"),
  // A TEXT prompt is a plain string; a CHAT prompt is a list of role/content messages.
  prompt: z.union([z.string().min(1), z.array(z.record(z.string(), z.unknown())).min(1)]),
  labels: z.array(z.string()).default([]),
  config: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });

  const parsed = CreatePromptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const created = await createPromptVersion({
    projectId: auth.projectId,
    ...parsed.data,
    prompt: parsed.data.prompt as Prisma.InputJsonValue,
    config: parsed.data.config as Prisma.InputJsonValue | undefined,
  });
  return NextResponse.json(created, { status: 201 });
}
