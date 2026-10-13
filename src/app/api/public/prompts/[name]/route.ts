import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateApiKey } from "@/server/apiKeyAuth";

const PRODUCTION_LABEL = "production";

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = await authenticateApiKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ message: "Invalid or missing API key" }, { status: 401 });

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const versionParam = req.nextUrl.searchParams.get("version");
  const label = req.nextUrl.searchParams.get("label") ?? (versionParam ? undefined : PRODUCTION_LABEL);

  const where = versionParam
    ? { projectId: auth.projectId, name: decodedName, version: Number(versionParam) }
    : { projectId: auth.projectId, name: decodedName, labels: { has: label! } };

  const prompt = await prisma.prompt.findFirst({ where, orderBy: { version: "desc" } });
  if (!prompt) {
    return NextResponse.json(
      { message: `Prompt "${decodedName}" not found with ${versionParam ? `version '${versionParam}'` : `label '${label ?? PRODUCTION_LABEL}'`}` },
      { status: 404 },
    );
  }

  return NextResponse.json({ ...prompt, isActive: prompt.labels.includes(PRODUCTION_LABEL) });
}
