import type { GameId } from "@/lib/game/registry";

/**
 * A shareable session: enough to reconstruct another person's view, including
 * the prices they wrote down. Encoded into the URL hash (client-only, never
 * sent to a server). The build is referenced by its original import input
 * (pobb.in link or PoB code) and re-imported on open.
 *
 * Keeping `input` a *link* rather than a pasted PoB code is what keeps the URL
 * short — see `shortenBuildInput`. Codes are still accepted so a share works
 * even when the shortener is unreachable.
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

/**
 * The price state carried *inside* a shared pobb.in paste, in its PoB Notes.
 *
 * Same information as a `SharePayload` minus `input`: the paste is the build,
 * so the reference is the paste id itself and the URL never has to carry either
 * the build or the prices. That is what makes a shared link a fixed ~40
 * characters no matter how many items were priced by hand.
 */
export interface EmbeddedPrices {
  v: 1;
  game: GameId;
  setId: string;
  league: string;
  prices: Record<string, string>;
}

/**
 * Marks a deflate-compressed payload. Unambiguous because an uncompressed
 * payload is base64 of JSON, which always starts with `{` — encoded as `e`.
 * Links minted before compression existed carry no prefix and still decode.
 */
const COMPRESSED_PREFIX = "z";

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

async function pipe(bytes: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Compress, or null on browsers without CompressionStream (caller falls back). */
async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    return await pipe(bytes, new CompressionStream("deflate"));
  } catch {
    return null;
  }
}

async function pack(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  // The price map is highly repetitive (every key repeats "poe1|gear|…"), so
  // deflate takes the bulk of it off on its own.
  const packed = await deflate(json);
  return packed ? COMPRESSED_PREFIX + toBase64Url(packed) : toBase64Url(json);
}

async function unpack(encoded: string): Promise<unknown> {
  const compressed = encoded.startsWith(COMPRESSED_PREFIX);
  const raw = fromBase64Url(compressed ? encoded.slice(1) : encoded);
  const bytes = compressed ? await pipe(raw, new DecompressionStream("deflate")) : raw;
  return JSON.parse(new TextDecoder().decode(bytes));
}

function assertVersioned(parsed: { v?: number; game?: string }): void {
  if (parsed.v !== 1 || (parsed.game !== "poe1" && parsed.game !== "poe2")) {
    throw new Error("Unrecognized share payload.");
  }
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  return pack(payload);
}

export async function decodeShare(encoded: string): Promise<SharePayload> {
  const parsed = (await unpack(encoded)) as SharePayload;
  assertVersioned(parsed);
  return parsed;
}

export async function encodeEmbeddedPrices(payload: EmbeddedPrices): Promise<string> {
  return pack(payload);
}

export async function decodeEmbeddedPrices(encoded: string): Promise<EmbeddedPrices> {
  const parsed = (await unpack(encoded)) as EmbeddedPrices;
  assertVersioned(parsed);
  if (!parsed.prices || typeof parsed.prices !== "object") {
    throw new Error("Shared paste has no prices.");
  }
  return parsed;
}

const POBBIN_LINK = /pobb\.in\/[A-Za-z0-9_-]+/i;

/**
 * Reduce an import input to something short enough to live in a URL.
 *
 * A pasted PoB code is tens of kilobytes and grows by a third once base64'd,
 * which is what made share links unusable. It is uploaded to pobb.in — the same
 * paste service "Export to PoB" already uses — and the resulting link goes into
 * the payload instead. Inputs that are already links are returned untouched, so
 * nothing is uploaded that the user did not paste as a raw code.
 *
 * Falls back to the original input whenever the upload fails: a long link still
 * beats no link.
 */
export async function shortenBuildInput(input: string, title?: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed || POBBIN_LINK.test(trimmed)) return trimmed;
  try {
    const res = await fetch("/api/build/shorten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: trimmed, title }),
    });
    const json = (await res.json()) as { success: boolean; data: { url: string | null } | null };
    return json.success && json.data?.url ? json.data.url : trimmed;
  } catch {
    return trimmed;
  }
}
