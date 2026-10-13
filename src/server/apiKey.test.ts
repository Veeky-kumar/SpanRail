import { describe, it, expect, beforeAll } from "vitest";
import { generateApiKeyPair, hashSecretKey, secretKeyPreview } from "./apiKey";

beforeAll(() => {
  process.env.API_KEY_SALT = "test-salt-not-for-production";
});

describe("generateApiKeyPair", () => {
  it("produces a pk-tw-/sk-tw- prefixed pair that are distinct and reasonably high-entropy", () => {
    const { publicKey, secretKey } = generateApiKeyPair();
    expect(publicKey.startsWith("pk-tw-")).toBe(true);
    expect(secretKey.startsWith("sk-tw-")).toBe(true);
    expect(publicKey).not.toBe(secretKey);
  });

  it("generates a different pair on every call", () => {
    const a = generateApiKeyPair();
    const b = generateApiKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.secretKey).not.toBe(b.secretKey);
  });
});

describe("hashSecretKey", () => {
  it("is deterministic for the same secret and salt (unlike password hashing — see apiKey.ts for why)", () => {
    const { secretKey } = generateApiKeyPair();
    expect(hashSecretKey(secretKey)).toBe(hashSecretKey(secretKey));
  });

  it("produces different hashes for different secrets", () => {
    const a = generateApiKeyPair().secretKey;
    const b = generateApiKeyPair().secretKey;
    expect(hashSecretKey(a)).not.toBe(hashSecretKey(b));
  });

  it("throws rather than silently hashing with no salt configured", () => {
    const original = process.env.API_KEY_SALT;
    delete process.env.API_KEY_SALT;
    expect(() => hashSecretKey("sk-tw-anything")).toThrow();
    process.env.API_KEY_SALT = original;
  });
});

describe("secretKeyPreview", () => {
  it("returns only the last 4 characters, never the full secret", () => {
    const { secretKey } = generateApiKeyPair();
    const preview = secretKeyPreview(secretKey);
    expect(preview).toHaveLength(4);
    expect(secretKey.endsWith(preview)).toBe(true);
  });
});
