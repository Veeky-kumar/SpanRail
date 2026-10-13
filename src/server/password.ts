import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Passwords are low-entropy, human-chosen secrets (unlike API keys, which are
// high-entropy random tokens — see apiKey.ts for that reasoning). They need a slow,
// memory-hard KDF with a per-user salt to resist offline brute force. scrypt is built
// into Node, so this needs no extra dependency (bcrypt/argon2) for an MVP.
const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, KEY_LENGTH);
  const storedBuf = Buffer.from(hash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}
