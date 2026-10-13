import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { authenticateApiKey } from "@/server/apiKeyAuth";

const JsonValue: z.ZodType<Prisma.InputJsonValue> = z.any();

const CreateItemSchema = z.object({
  input: JsonValue,
  expectedOutput: JsonValue.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });

  const { datasetId } = await params;
  const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, projectId: auth.projectId } });
  if (!dataset) return NextResponse.json({ message: "Dataset not found" }, { status: 404 });

  const parsed = CreateItemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const item = await prisma.datasetItem.create({
    data: {
      projectId: auth.projectId,
      datasetId,
      input: parsed.data.input,
      expectedOutput: parsed.data.expectedOutput,
      metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
