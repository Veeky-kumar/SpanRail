import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { authenticateApiKey } from "@/server/apiKeyAuth";
import { DETERMINISTIC_SCORERS } from "@/server/scorers";

const CreateDatasetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scorers: z.array(z.enum(DETERMINISTIC_SCORERS)).default([]),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });

  const parsed = CreateDatasetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const dataset = await prisma.dataset.create({
      data: { projectId: auth.projectId, ...parsed.data },
    });
    return NextResponse.json(dataset, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : "Could not create dataset" }, { status: 409 });
  }
}
