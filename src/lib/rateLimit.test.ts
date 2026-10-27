import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then refuses with a retry time", () => {
    const rl = createRateLimiter(3, 60_000);
    expect([1, 2, 3].map(() => rl.hit("a", 0).allowed)).toEqual([true, true, true]);
    const fourth = rl.hit("a", 10_000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSec).toBe(50);
  });

  it("counts each key on its own", () => {
    const rl = createRateLimiter(1, 60_000);
    rl.hit("a", 0);
    expect(rl.hit("a", 1).allowed).toBe(false);
    expect(rl.hit("b", 1).allowed).toBe(true);
  });

  it("starts a fresh window once the old one ends", () => {
    const rl = createRateLimiter(1, 1000);
    rl.hit("a", 0);
    expect(rl.hit("a", 500).allowed).toBe(false);
    expect(rl.hit("a", 1000).allowed).toBe(true);
  });

  it("peek does not count", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.peek("a", 0).allowed).toBe(true);
    expect(rl.peek("a", 0).allowed).toBe(true);
    rl.hit("a", 0);
    expect(rl.peek("a", 1).allowed).toBe(false);
  });

  it("stays bounded under many distinct keys", () => {
    const rl = createRateLimiter(1, 60_000, 5);
    for (let i = 0; i < 50; i++) rl.hit(`k${i}`, i);
    // The oldest keys were dropped, so they start over; the newest is still tracked.
    expect(rl.hit("k0", 100).allowed).toBe(true);
    expect(rl.hit("k49", 100).allowed).toBe(false);
  });
});

describe("clientKey", () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;
  it("takes the first forwarded address", () => {
    expect(clientKey(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });
  it("falls back to x-real-ip, then unknown", () => {
    expect(clientKey(headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(headers({}))).toBe("unknown");
  });
});
