import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { authenticateApiKey } from "@/server/apiKeyAuth";

const CreateRunSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });

  const { datasetId } = await params;
  const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, projectId: auth.projectId } });
  if (!dataset) return NextResponse.json({ message: "Dataset not found" }, { status: 404 });

  const parsed = CreateRunSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const run = await prisma.datasetRun.create({
      data: { projectId: auth.projectId, datasetId, ...parsed.data },
    });
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Could not create run" }, { status: 409 });
  }
}
