/**
 * Minimal per-instance sliding-window rate limiter for API routes that make
 * outbound requests (pobb.in). Per-serverless-instance only — good enough to
 * stop accidental client retry loops from burning the shared egress IP.
 */
const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();
const MAX_KEYS = 500;

export function rateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= maxPerMinute) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  if (!buckets.has(key) && buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  buckets.set(key, hits);
  return true;
}

/** Best-effort client key from proxy headers (Vercel sets x-forwarded-for). */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
