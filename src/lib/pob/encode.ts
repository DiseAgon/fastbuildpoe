import { deflateSync } from "node:zlib";
import { stripPriceBlocks } from "./priceNotes";

/** Encode XML back into a Path of Building import code (zlib → URL-safe base64). */
export function encodePobCode(xml: string): string {
  const deflated = deflateSync(Buffer.from(xml, "utf8"));
  return deflated.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

/** The build's plain Notes text, or "" when it has none. */
export function extractNotes(xml: string): string {
  return xml.match(/<Notes>([\s\S]*?)<\/Notes>/)?.[1] ?? "";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Write the price table into the build's Notes (and drop NotesHTML so the plain
 * notes show in PoB). Done via targeted string edits to avoid re-serializing the
 * whole XML.
 *
 * Any table a previous export left is removed first, so the user's own notes
 * survive but the prices are replaced rather than stacked. The markers contain
 * no XML-escapable characters, so the stripper works on the escaped text.
 */
export function injectNotes(xml: string, notes: string): string {
  const safe = escapeXml(notes);
  // Remove rich NotesHTML so PoB renders our plain Notes.
  let out = xml.replace(/<NotesHTML>[\s\S]*?<\/NotesHTML>/, "");

  if (/<Notes>[\s\S]*?<\/Notes>/.test(out)) {
    out = out.replace(/<Notes>([\s\S]*?)<\/Notes>/, (_m, inner: string) => {
      const kept = stripPriceBlocks(inner);
      const sep = kept ? "\n\n" : "";
      return `<Notes>${kept}${sep}${safe}</Notes>`;
    });
  } else if (/<Notes\s*\/>/.test(out)) {
    out = out.replace(/<Notes\s*\/>/, `<Notes>${safe}</Notes>`);
  } else {
    out = out.replace(/(<PathOfBuilding2?\b[^>]*>)/, `$1<Notes>${safe}</Notes>`);
  }
  return out;
}
