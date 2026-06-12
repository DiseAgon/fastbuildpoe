import { deflateSync } from "node:zlib";

/** Encode XML back into a Path of Building import code (zlib → URL-safe base64). */
export function encodePobCode(xml: string): string {
  const deflated = deflateSync(Buffer.from(xml, "utf8"));
  return deflated.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Append text to the build's Notes (and drop NotesHTML so the plain notes show
 * in PoB). Done via targeted string edits to avoid re-serializing the whole XML.
 */
export function injectNotes(xml: string, notes: string): string {
  const safe = escapeXml(notes);
  // Remove rich NotesHTML so PoB renders our plain Notes.
  let out = xml.replace(/<NotesHTML>[\s\S]*?<\/NotesHTML>/, "");

  if (/<Notes>[\s\S]*?<\/Notes>/.test(out)) {
    out = out.replace(/<Notes>([\s\S]*?)<\/Notes>/, (_m, inner: string) => {
      const sep = inner.trim() ? "\n\n" : "";
      return `<Notes>${inner}${sep}${safe}</Notes>`;
    });
  } else if (/<Notes\s*\/>/.test(out)) {
    out = out.replace(/<Notes\s*\/>/, `<Notes>${safe}</Notes>`);
  } else {
    out = out.replace(/(<PathOfBuilding2?\b[^>]*>)/, `$1<Notes>${safe}</Notes>`);
  }
  return out;
}
