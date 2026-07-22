import crypto from "node:crypto";

/**
 * Minimal signed-cookie helpers (HMAC-SHA256). Used to carry the OAuth PKCE
 * handshake and the access token in httpOnly cookies. Set SESSION_SECRET in env.
 */
function secret(): string {
  const env = process.env.SESSION_SECRET;
  if (env) return env;
  // A public fallback secret would make session cookies forgeable in prod.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  return "fastbuildpoe-dev-insecure-secret";
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function signSession(payload: unknown): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${data}.${hmac(data)}`;
}

export function verifySession<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = hmac(data);
  // constant-time compare
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "poe_session";
export const HANDSHAKE_COOKIE = "poe_oauth";
