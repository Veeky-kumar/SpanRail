import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { authenticateApiKey } from "@/server/apiKeyAuth";
import { runDeterministicScorer, isDeterministicScorerName } from "@/server/scorers";

const LinkRunItemSchema = z.object({
  datasetItemId: z.string().min(1),
  traceId: z.string().min(1),
  // Defaults to the trace's root observation when omitted.
  observationId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ datasetId: string; runId: string }> },
) {
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });

  const { datasetId, runId } = await params;
  const run = await prisma.datasetRun.findFirst({ where: { id: runId, datasetId, projectId: auth.projectId } });
  if (!run) return NextResponse.json({ message: "Dataset run not found" }, { status: 404 });

  const parsed = LinkRunItemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }
  const { datasetItemId, traceId, observationId } = parsed.data;

  const item = await prisma.datasetItem.findFirst({ where: { id: datasetItemId, datasetId, projectId: auth.projectId } });
  if (!item) return NextResponse.json({ message: "Dataset item not found" }, { status: 404 });

  const observation = observationId
    ? await prisma.observation.findFirst({ where: { id: observationId, projectId: auth.projectId, traceId } })
    : await prisma.observation.findFirst({ where: { projectId: auth.projectId, traceId, parentObservationId: null } });
  if (!observation) {
    return NextResponse.json({ message: "No matching observation found for traceId/observationId" }, { status: 404 });
  }

  const dataset = await prisma.dataset.findUniqueOrThrow({ where: { id: datasetId } });

  const runItem = await prisma.datasetRunItem.create({
    data: {
      projectId: auth.projectId,
      datasetRunId: runId,
      datasetItemId,
      traceId,
      observationId: observation.id,
      inputSnapshot: item.input as object,
      expectedOutputSnapshot: item.expectedOutput as object | undefined,
    },
  });

  const scoresWritten = [];
  for (const scorerName of dataset.scorers) {
    if (!isDeterministicScorerName(scorerName)) continue;
    const result = runDeterministicScorer(scorerName, observation.output, item.expectedOutput);
    const score = await prisma.score.create({
      data: {
        projectId: auth.projectId,
        traceId,
        observationId: observation.id,
        name: scorerName,
        value: result.value,
        dataType: "BOOLEAN",
        source: "EVAL",
        comment: result.comment,
      },
    });
    scoresWritten.push(score);
  }

  return NextResponse.json({ runItem, scoresWritten }, { status: 201 });
}
