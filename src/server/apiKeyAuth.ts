import { timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { hashSecretKey } from "./apiKey";

export interface AuthenticatedProject {
  projectId: string;
}

/**
 * Validates the `Authorization: Basic base64(publicKey:secretKey)` header used by the
 * SDK for ingestion. No caching layer yet (MVP) — the next thing to add once ingestion
 * throughput makes a per-request Postgres lookup a bottleneck.
 */
export async function authenticateApiKey(authorizationHeader: string | null): Promise<AuthenticatedProject | null> {
  if (!authorizationHeader?.startsWith("Basic ")) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return null;

  const publicKey = decoded.slice(0, separatorIndex);
  const secretKey = decoded.slice(separatorIndex + 1);

  const apiKey = await prisma.apiKey.findUnique({ where: { publicKey } });
  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  const hashed = Buffer.from(hashSecretKey(secretKey), "hex");
  const stored = Buffer.from(apiKey.hashedSecretKey, "hex");
  if (hashed.length !== stored.length || !timingSafeEqual(hashed, stored)) return null;

  return { projectId: apiKey.projectId };
}
