import crypto from "node:crypto";

/**
 * GGG OAuth ("Sign in with Path of Exile") + character API.
 * Requires a GGG-registered OAuth client (see OAUTH_SETUP.md). All values come
 * from env; when unset, the feature is reported disabled and stays dormant.
 */

const AUTHORIZE_URL = "https://www.pathofexile.com/oauth/authorize";
const TOKEN_URL = "https://www.pathofexile.com/oauth/token";
const API_BASE = "https://api.pathofexile.com";
const SCOPE = "account:characters";

const USER_AGENT = process.env.APP_USER_AGENT ?? "FastBuildPOE/0.1 (+contact)";

export interface OAuthConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  enabled: boolean;
}

export function oauthConfig(): OAuthConfig {
  const clientId = process.env.POE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.POE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.POE_OAUTH_REDIRECT_URI;
  return {
    clientId,
    clientSecret,
    redirectUri,
    enabled: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function makeState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

// Confidential client (per GGG docs): client_secret auth, no PKCE; `state` for CSRF.
export function authorizeUrl(state: string): string {
  const { clientId, redirectUri } = oauthConfig();
  const params = new URLSearchParams({
    client_id: clientId ?? "",
    response_type: "code",
    scope: SCOPE,
    state,
    redirect_uri: redirectUri ?? "",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const body = new URLSearchParams({
    client_id: clientId ?? "",
    client_secret: clientSecret ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri ?? "",
    scope: SCOPE,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body,
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed (${res.status}).`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("No access token in OAuth response.");
  return json.access_token;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT };
}

export async function fetchCharacterList(token: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/character`, { headers: authHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to list characters (${res.status}).`);
  const json = (await res.json()) as { characters?: Array<{ name?: string }> };
  return (json.characters ?? []).map((c) => c.name).filter((n): n is string => !!n);
}

export async function fetchCharacterData(token: string, name: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/character/${encodeURIComponent(name)}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to fetch character "${name}" (${res.status}).`);
  const json = (await res.json()) as { character?: unknown };
  return json.character;
}
