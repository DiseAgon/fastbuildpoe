import type { GameId } from "@/lib/game/registry";

/**
 * A shareable session: enough to reconstruct another person's view, including
 * the prices they wrote down. Encoded into the URL hash (client-only, never
 * sent to a server). The build is referenced by its original import input
 * (pobb.in link or PoB code) and re-imported on open.
 *
 * Current shares mint `#p=<pobb.in id>`. Old `#s=` hashes still decode here.
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
