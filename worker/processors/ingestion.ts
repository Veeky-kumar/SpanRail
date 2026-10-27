import { prisma } from "../../src/server/db";
import { IngestBodySchemaByType, IngestEventType } from "../../src/ingest/schema";

interface ObservationUpsertFields {
  id: string;
  traceId: string;
  parentObservationId?: string | null;
  type?: "SPAN" | "GENERATION" | "EVENT";
  name?: string;
  traceName?: string;
  startTime?: string;
  endTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  level?: string;
  statusMessage?: string;
  model?: string;
  modelParameters?: unknown;
  usageDetails?: unknown;
  costDetails?: unknown;
  totalCost?: number;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  promptName?: string;
  promptVersion?: number;
}

/**
 * Merge-upsert, not replace-upsert. Only fields explicitly present in `fields` are
 * written, both on create and on update. This is what makes a "start" event followed
 * later by an "end" event (or the reverse, under out-of-order delivery) converge to the
 * same row instead of one event clobbering the other's fields. See ARCHITECTURE.md,
 * "Ingestion flow". Convergence is done by an explicit field-level merge in Postgres, since
 * there is no column-store engine to dedupe rows for us.
 */
async function upsertObservation(projectId: string, fields: ObservationUpsertFields) {
  const { id, traceId, ...rest } = fields;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    data[key] = key === "startTime" || key === "endTime" ? new Date(value as string) : value;
  }

  await prisma.observation.upsert({
    where: { projectId_id: { projectId, id } },
    create: { id, projectId, traceId, ...data },
    update: data,
  });
}

async function markError(stagingId: string, message: string) {
  await prisma.ingestEvent.update({ where: { id: stagingId }, data: { error: message } });
}

export async function processIngestEvent(stagingId: string): Promise<void> {
  const staged = await prisma.ingestEvent.findUnique({ where: { id: stagingId } });
  if (!staged || staged.processedAt) return;

  const eventType = staged.eventType as IngestEventType;
  const schema = IngestBodySchemaByType[eventType];
  if (!schema) {
    await markError(staged.id, `Unknown event type: ${staged.eventType}`);
    return;
  }

  const parsed = schema.safeParse(staged.payload);
  if (!parsed.success) {
    await markError(staged.id, parsed.error.message);
    return;
  }
  const body = parsed.data as Record<string, any>;

  switch (eventType) {
    case "trace-create":
      await upsertObservation(staged.projectId, {
        id: body.id,
        traceId: body.traceId,
        parentObservationId: body.parentObservationId ?? null,
        type: "SPAN",
        name: body.name,
        traceName: body.name,
        startTime: body.startTime,
        input: body.input,
        metadata: body.metadata,
        userId: body.userId,
        sessionId: body.sessionId,
        tags: body.tags ?? [],
      });
      break;

    case "span-create":
      await upsertObservation(staged.projectId, {
        id: body.id,
        traceId: body.traceId,
        parentObservationId: body.parentObservationId ?? null,
        type: "SPAN",
        name: body.name,
        startTime: body.startTime,
        input: body.input,
        metadata: body.metadata,
      });
      break;

    case "generation-create":
      await upsertObservation(staged.projectId, {
        id: body.id,
        traceId: body.traceId,
        parentObservationId: body.parentObservationId ?? null,
        type: "GENERATION",
        name: body.name,
        startTime: body.startTime,
        input: body.input,
        metadata: body.metadata,
        model: body.model,
        modelParameters: body.modelParameters,
        promptName: body.promptName,
        promptVersion: body.promptVersion,
      });
      break;

    case "event-create":
      await upsertObservation(staged.projectId, {
        id: body.id,
        traceId: body.traceId,
        parentObservationId: body.parentObservationId ?? null,
        type: "EVENT",
        name: body.name,
        startTime: body.startTime,
        endTime: body.startTime,
        input: body.input,
        metadata: body.metadata,
        level: body.level ?? "DEFAULT",
      });
      break;

    case "span-update":
      await upsertObservation(staged.projectId, {
        id: body.id,
        traceId: body.traceId,
        type: "SPAN",
        endTime: body.endTime,
        output: body.output,
        level: body.level ?? "DEFAULT",
        statusMessage: body.statusMessage,
        metadata: body.metadata,
      });
      break;

    case "generation-update": {
      // SDK-reported cost is authoritative when present (provided cost/usage takes
      // precedence over computed). We do not yet compute cost
      // from a tokenizer + pricing table when the SDK omits it — documented MVP gap,
      // not a silent one.
      const totalCost = body.costDetails
        ? Object.values(body.costDetails as Record<string, number>).reduce((a, b) => a + b, 0)
        : undefined;
      await upsertObservation(staged.projectId, {
        id: body.id,
        traceId: body.traceId,
        type: "GENERATION",
        endTime: body.endTime,
        output: body.output,
        level: body.level ?? "DEFAULT",
        statusMessage: body.statusMessage,
        metadata: body.metadata,
        usageDetails: body.usageDetails,
        costDetails: body.costDetails,
        totalCost,
      });
      break;
    }

    case "score-create":
      await prisma.score.upsert({
        where: { id: body.id },
        create: {
          id: body.id,
          projectId: staged.projectId,
          traceId: body.traceId,
          observationId: body.observationId ?? null,
          name: body.name,
          value: body.value,
          stringValue: body.stringValue,
          dataType: body.stringValue !== undefined ? "CATEGORICAL" : "NUMERIC",
          source: "API",
          comment: body.comment,
        },
        update: {
          value: body.value,
          stringValue: body.stringValue,
          comment: body.comment,
        },
      });
      break;
  }

  await prisma.ingestEvent.update({ where: { id: staged.id }, data: { processedAt: new Date() } });
}
