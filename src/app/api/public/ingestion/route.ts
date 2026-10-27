import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { IngestBatchSchema, IngestEventSchema } from "@/ingest/schema";
import { getIngestionQueue } from "@/server/queue";
import { authenticateApiKey } from "@/server/apiKeyAuth";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

interface ResultEntry {
  id: string;
  status: number;
  message?: string;
}

// Wrong keys: 30 failures a minute per address stops key guessing without touching a working client. Working keys:
// 1,200 requests a minute per project, which is a batch every 50 ms. SDKs batch, and both retry on 429.
const badKeys = createRateLimiter(30, 60 * 1000);
const perProject = createRateLimiter(1200, 60 * 1000);

const tooMany = (retryAfterSec: number) =>
  NextResponse.json({ message: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });

export async function POST(req: NextRequest) {
  const caller = clientKey((n) => req.headers.get(n));
  const blocked = badKeys.peek(caller);
  if (!blocked.allowed) return tooMany(blocked.retryAfterSec);

  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) {
    badKeys.hit(caller);
    return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });
  }
  const limited = perProject.hit(auth.projectId);
  if (!limited.allowed) return tooMany(limited.retryAfterSec);

  const json = await req.json().catch(() => null);
  const batchParse = IngestBatchSchema.safeParse(json);
  if (!batchParse.success) {
    return NextResponse.json({ message: "Invalid request body", issues: batchParse.error.issues }, { status: 400 });
  }

  const successes: ResultEntry[] = [];
  const errors: ResultEntry[] = [];
  const queue = getIngestionQueue();

  for (const rawEvent of batchParse.data.batch) {
    const parsed = IngestEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      const id = typeof (rawEvent as { id?: unknown })?.id === "string" ? (rawEvent as { id: string }).id : "unknown";
      errors.push({ id, status: 400, message: parsed.error.issues.map((i) => i.message).join("; ") });
      continue;
    }

    const event = parsed.data;
    try {
      const staged = await prisma.ingestEvent.upsert({
        where: { projectId_eventId: { projectId: auth.projectId, eventId: event.id } },
        update: {},
        create: {
          projectId: auth.projectId,
          eventId: event.id,
          entityId: event.body.id,
          eventType: event.type,
          payload: event.body as Prisma.InputJsonValue,
        },
      });

      await queue.add(
        "process-ingest-event",
        { stagingId: staged.id },
        { jobId: staged.id },
      );

      successes.push({ id: event.body.id, status: 201 });
    } catch (err) {
      errors.push({ id: event.body.id, status: 500, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json({ successes, errors }, { status: 207 });
}
