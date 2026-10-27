import { z } from "zod";

const ObservationLevel = z.enum(["DEBUG", "DEFAULT", "WARNING", "ERROR"]);

const jsonMetadata = z.record(z.string(), z.unknown()).optional();

const SpanCreateBody = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  parentObservationId: z.string().nullable().optional(),
  startTime: z.string().datetime(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  metadata: jsonMetadata,
});

// A trace is its own root observation (id === traceId, parentObservationId null) — see
// ARCHITECTURE.md. Structurally identical to a span-create, plus trace-level fields
// that only matter when this row happens to be a root.
const TraceCreateBody = SpanCreateBody.extend({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const SpanUpdateBody = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  endTime: z.string().datetime(),
  output: z.unknown().optional(),
  level: ObservationLevel.optional(),
  statusMessage: z.string().optional(),
  metadata: jsonMetadata,
});

const GenerationCreateBody = SpanCreateBody.extend({
  model: z.string().optional(),
  modelParameters: z.record(z.string(), z.unknown()).optional(),
  // Denormalized, no FK (see
  // ARCHITECTURE.md): this is analytics data, the Prompt row is the source of truth.
  promptName: z.string().optional(),
  promptVersion: z.number().int().optional(),
});

const GenerationUpdateBody = SpanUpdateBody.extend({
  usageDetails: z.record(z.string(), z.number()).optional(),
  costDetails: z.record(z.string(), z.number()).optional(),
});

const EventCreateBody = SpanCreateBody.extend({
  level: ObservationLevel.optional(),
});

const ScoreCreateBody = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  observationId: z.string().optional(),
  name: z.string().min(1),
  value: z.number().optional(),
  stringValue: z.string().optional(),
  comment: z.string().optional(),
});

export const IngestEventSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("trace-create"), body: TraceCreateBody }),
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("span-create"), body: SpanCreateBody }),
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("span-update"), body: SpanUpdateBody }),
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("generation-create"), body: GenerationCreateBody }),
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("generation-update"), body: GenerationUpdateBody }),
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("event-create"), body: EventCreateBody }),
  z.object({ id: z.string(), timestamp: z.string().datetime(), type: z.literal("score-create"), body: ScoreCreateBody }),
]);

export type IngestEvent = z.infer<typeof IngestEventSchema>;

export const IngestBatchSchema = z.object({
  batch: z.array(z.unknown()).min(1).max(1000),
});

// Re-validated by the worker against the exact body shape for its event type, since the
// staging table stores payload as untyped Json — defense in depth against a staging row
// written by a future/older API version with a different shape.
export const IngestBodySchemaByType = {
  "trace-create": TraceCreateBody,
  "span-create": SpanCreateBody,
  "span-update": SpanUpdateBody,
  "generation-create": GenerationCreateBody,
  "generation-update": GenerationUpdateBody,
  "event-create": EventCreateBody,
  "score-create": ScoreCreateBody,
} as const;

export type IngestEventType = keyof typeof IngestBodySchemaByType;
