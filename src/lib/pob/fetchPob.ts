/**
 * Resolve user input into a raw Path of Building export code.
 *
 * Accepts:
 *  - a pobb.in URL (https://pobb.in/<id>) → fetches `…/raw`
 *  - a bare pobb.in id (short alphanumeric) → fetches `…/raw`
 *  - a raw PoB export code pasted directly → returned as-is
 */

const USER_AGENT =
  process.env.APP_USER_AGENT ?? "FastBuildPOE/0.1 (+https://github.com/)";

const POBBIN_URL = /pobb\.in\/([A-Za-z0-9_-]+)/i;
const BARE_ID = /^[A-Za-z0-9_-]{4,20}$/;

/** Short-lived per-instance cache of pobb.in pastes: repeat imports of the
 * same build (shared links, retries) skip the outbound fetch entirely. */
const PASTE_CACHE_TTL_MS = 10 * 60 * 1000;
const PASTE_CACHE_MAX = 100;
const pasteCache = new Map<string, { body: string; expires: number }>();

function cacheGet(id: string): string | null {
  const hit = pasteCache.get(id);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    pasteCache.delete(id);
    return null;
  }
  return hit.body;
}

function cacheSet(id: string, body: string): void {
  if (pasteCache.size >= PASTE_CACHE_MAX) {
    const oldest = pasteCache.keys().next().value;
    if (oldest !== undefined) pasteCache.delete(oldest);
  }
  pasteCache.set(id, { body, expires: Date.now() + PASTE_CACHE_TTL_MS });
}

export async function resolvePobInput(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("No build link or code provided.");
  }

  const urlMatch = trimmed.match(POBBIN_URL);
  if (urlMatch) {
    return fetchPobbinRaw(urlMatch[1]);
  }

  // Short, link-shaped tokens are treated as pobb.in ids; long strings are raw codes.
  if (BARE_ID.test(trimmed)) {
    return fetchPobbinRaw(trimmed);
  }

  return trimmed;
}

async function fetchPobbinRaw(id: string): Promise<string> {
  const cached = cacheGet(id);
  if (cached) return cached;

  let res: Response;
  // pobb.in fetches from a datacenter IP (Vercel) are occasionally flaky;
  // retry a couple of times with a timeout before giving up.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      res = await fetch(`https://pobb.in/${id}/raw`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      lastError = "Could not reach pobb.in.";
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 404) {
      throw new Error(`pobb.in build "${id}" not found.`);
    }
    if (!res.ok) {
      lastError = `pobb.in returned ${res.status}.`;
      continue; // retry transient 5xx / rate limits
    }

    const body = (await res.text()).trim();
    if (body) {
      cacheSet(id, body);
      return body;
    }
    lastError = `pobb.in build "${id}" was empty.`;
  }

  throw new Error(`${lastError} Please try importing again.`);
}
