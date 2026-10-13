import { randomBytes, createHash } from "node:crypto";

const PUBLIC_KEY_PREFIX = "pk-tw-";
const SECRET_KEY_PREFIX = "sk-tw-";

export function generateApiKeyPair(): {
  publicKey: string;
  secretKey: string;
} {
  return {
    publicKey: PUBLIC_KEY_PREFIX + randomBytes(16).toString("hex"),
    secretKey: SECRET_KEY_PREFIX + randomBytes(24).toString("hex"),
  };
}

// The secret half is a high-entropy random token, so a fast salted SHA-256 is enough
// (no brute-force risk from a stolen hash) and avoids paying bcrypt's per-request cost
// on every ingestion call. Same reasoning Langfuse's own fast-hash scheme uses.
export function hashSecretKey(secretKey: string): string {
  const salt = process.env.API_KEY_SALT;
  if (!salt) {
    throw new Error("API_KEY_SALT environment variable is not set");
  }
  return createHash("sha256").update(secretKey).update(salt).digest("hex");
}

export function secretKeyPreview(secretKey: string): string {
  return secretKey.slice(-4);
}
