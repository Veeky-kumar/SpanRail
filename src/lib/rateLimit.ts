// A small fixed-window rate limiter held in memory. It is meant for one web process (the default deployment); with
// several replicas each one counts on its own, so the effective limit is the limit times the replica count.
// Keys such as an IP address live only in this map until their window ends. They are never written anywhere.
export interface RateResult {
  allowed: boolean;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSec: number;
}

export interface RateLimiter {
  /** Counts one hit and says whether it is within the limit. */
  hit(key: string, now?: number): RateResult;
  /** Says whether one more hit would be allowed, without counting it. */
  peek(key: string, now?: number): RateResult;
}

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  const current = (key: string, now: number) => {
    const w = windows.get(key);
    return w && now - w.start < windowMs ? w : undefined;
  };
  const verdict = (count: number, start: number, now: number): RateResult =>
    count <= limit ? { allowed: true, retryAfterSec: 0 } : { allowed: false, retryAfterSec: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };

  return {
    hit(key, now = Date.now()) {
      if (windows.size >= maxKeys) {
        for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
        // Still full of live windows: drop the oldest so memory stays bounded under a flood of distinct keys.
        if (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
      }
      const w = current(key, now) ?? { start: now, count: 0 };
      w.count += 1;
      windows.set(key, w);
      return verdict(w.count, w.start, now);
    },
    peek(key, now = Date.now()) {
      const w = current(key, now);
      return w ? verdict(w.count + 1, w.start, now) : { allowed: true, retryAfterSec: 0 };
    },
  };
}

/**
 * The caller's address for rate limiting only. Behind Render, Vercel or Cloudflare the first entry of
 * `x-forwarded-for` is the client; with no proxy there is no header and every caller shares the "unknown" bucket.
 */
export function clientKey(get: (name: string) => string | null): string {
  const forwarded = get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || get("x-real-ip")?.trim() || "unknown";
}
