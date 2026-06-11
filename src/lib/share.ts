import type { GameId } from "@/lib/game/registry";

/**
 * A shareable session: enough to reconstruct another person's view, including
 * the prices they wrote down. Encoded into the URL hash (client-only, never
 * sent to a server). The build is referenced by its original import input
 * (pobb.in link or PoB code) and re-imported on open.
 */
export interface SharePayload {
  v: 1;
  game: GameId;
  /** Original import input (pobb.in link or raw PoB code). */
  input: string;
  /** Selected item-set/version id. */
  setId: string;
  league: string;
  /** Price-by-item-key map (keys as produced by BuildContext.keyFor). */
  prices: Record<string, string>;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeShare(encoded: string): SharePayload {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  const parsed = JSON.parse(json) as SharePayload;
  if (parsed.v !== 1 || (parsed.game !== "poe1" && parsed.game !== "poe2")) {
    throw new Error("Unrecognized share payload.");
  }
  return parsed;
}
