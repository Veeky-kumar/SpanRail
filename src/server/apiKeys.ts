import { prisma } from "./db";
import { generateApiKeyPair, hashSecretKey, secretKeyPreview } from "./apiKey";

export async function listApiKeys(projectId: string) {
  return prisma.apiKey.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
}

/** Returns the plaintext secret once — it is hashed before storage and cannot be recovered after this call. */
export async function createApiKey(projectId: string) {
  const { publicKey, secretKey } = generateApiKeyPair();
  await prisma.apiKey.create({
    data: {
      projectId,
      publicKey,
      hashedSecretKey: hashSecretKey(secretKey),
      secretKeyPreview: secretKeyPreview(secretKey),
    },
  });
  return { publicKey, secretKey };
}
