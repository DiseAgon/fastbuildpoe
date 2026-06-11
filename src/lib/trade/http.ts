/** Shared User-Agent for all outbound PoE / pobb.in requests. */
export const USER_AGENT =
  process.env.APP_USER_AGENT ?? "FastBuildPOE/0.1 (+https://github.com/)";

export const TRADE_HEADERS: HeadersInit = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
};

/**
 * fetch with an abort timeout, so a Cloudflare-blocked/hung request on a cloud
 * host fails fast and the caller can fall back to bundled data.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2500,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
