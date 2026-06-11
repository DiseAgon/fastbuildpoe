import { inflateSync } from "node:zlib";

/**
 * Decode a Path of Building export string into its XML.
 *
 * Wire format: URL-safe base64 → zlib-inflate → XML.
 * (PoB uses `-`/`_` instead of `+`/`/` and may omit padding.)
 */
export function decodePobCode(code: string): string {
  const cleaned = code.trim().replace(/\s+/g, "");
  if (!cleaned) {
    throw new Error("Empty Path of Building code.");
  }

  const base64 = cleaned.replace(/-/g, "+").replace(/_/g, "/");

  let compressed: Buffer;
  try {
    compressed = Buffer.from(base64, "base64");
  } catch {
    throw new Error("Code is not valid base64.");
  }

  if (compressed.length === 0) {
    throw new Error("Code decoded to empty data.");
  }

  let xml: string;
  try {
    xml = inflateSync(compressed).toString("utf8");
  } catch {
    throw new Error(
      "Could not decompress the code — it may be truncated or not a Path of Building export.",
    );
  }

  if (!xml.includes("<PathOfBuilding")) {
    throw new Error("Decoded data is not a Path of Building build.");
  }

  return xml;
}
