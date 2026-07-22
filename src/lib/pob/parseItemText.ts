import type { ModType, ParsedItem, ParsedMod, Rarity } from "@/types/item";
import { categorize } from "./categorize";

/**
 * Parse a single Path of Building item block into a structured item.
 *
 * PoB serializes items in a clipboard-like text format with extra annotations:
 *   Rarity: RARE
 *   Loath Cut
 *   Vaal Regalia
 *   Unique ID: ...
 *   Item Level: 84
 *   Quality: 20
 *   Sockets: B-B-B
 *   LevelReq: 68
 *   Implicits: 1
 *   {crafted}+12% to Cold Resistance
 *   +50 to maximum Life
 *   Corrupted
 *
 * Inline annotations handled: {range:n}, {crafted}, {fractured}, {variant:a,b},
 * {tags:...}, {custom}. Variant lines are filtered to the item's selected variant.
 */

const NUMBER = /[+-]?\d+(?:\.\d+)?/g;
const ANNOTATION = /\{[^}]*\}/g;
/** PoB unrolled range: `(10-25)% increased …`, `+(16-24) to …`, `-(20-10)% to …`. */
const RANGE_SPAN = /(-?)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/g;

/**
 * Resolve PoB `(min-max)` spans into the concrete roll the build uses.
 * PoB stores the roll position in a `{range:n}` annotation (0..1, default 0.5):
 * value = min + n·(max-min). A leading `-` outside the parens negates the roll
 * (e.g. `-(20-10)% to all Elemental Resistances` → -15 at n=0.5).
 */
function resolveRangeSpans(text: string, rangePos: number): string {
  return text.replace(RANGE_SPAN, (_m, sign: string, lo: string, hi: string) => {
    const min = Number(lo);
    const max = Number(hi);
    const raw = min + rangePos * (max - min);
    const isInt = Number.isInteger(min) && Number.isInteger(max);
    const value = isInt ? Math.round(raw) : Math.round(raw * 100) / 100;
    return `${sign === "-" ? -value : value}`;
  });
}

/** The roll position from a `{range:n}` annotation, default mid-roll. */
function rangePosOf(annotations: string[]): number {
  for (const a of annotations) {
    if (a.startsWith("range:")) {
      const n = Number.parseFloat(a.slice("range:".length));
      if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
    }
  }
  return 0.5;
}

/** Metadata keys (lines shaped `Key: value`) that are not mods. */
const META_KEYS = new Set([
  "rarity",
  "unique id",
  "item level",
  "itemlevel",
  "quality",
  "sockets",
  "levelreq",
  "requires",
  "requirements",
  "level",
  "implicits",
  "prefix",
  "suffix",
  "selected variant",
  "variant",
  "league",
  "source",
  "catalyst",
  "catalystquality",
  "talisman tier",
  "has alt variant",
  "armour",
  "evasion",
  "evasion rating",
  "energy shield",
  "ward",
  "rune",
  "radius",
  "limited to",
  "crucible",
  "implicit",
  "crafted",
]);

/** Standalone flag lines that are item properties, not mods. */
const INFLUENCE_LINE =
  /^(Shaper|Elder|Crusader|Hunter|Redeemer|Warlord|Searing Exarch|Eater of Worlds) Item$/i;
const FLAG_LINE = /^(Synthesised Item|Fractured Item|Mirrored|Split|Foil Unique(?: \([^)]*\))?)$/i;

/** A line shaped like `Key: value` (used to skip unknown metadata such as `Rune:`). */
const META_SHAPED = /^[A-Za-z][A-Za-z'/ ]*:\s/;

interface MetaLine {
  key: string;
  value: string;
}

function asMeta(line: string): MetaLine | null {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const key = line.slice(0, idx).trim().toLowerCase();
  if (!META_KEYS.has(key)) return null;
  return { key, value: line.slice(idx + 1).trim() };
}

function detectModType(annotations: string[], isImplicit: boolean): ModType {
  if (annotations.includes("crafted")) return "crafted";
  if (annotations.includes("fractured")) return "fractured";
  if (annotations.includes("scourge")) return "scourge";
  return isImplicit ? "implicit" : "explicit";
}

/** Returns the variant ids referenced by a `{variant:a,b}` annotation, if any. */
function variantIds(annotations: string[]): number[] | null {
  for (const a of annotations) {
    if (a.startsWith("variant:")) {
      return a
        .slice("variant:".length)
        .split(",")
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isFinite(n));
    }
  }
  return null;
}

function extractAnnotations(line: string): string[] {
  const out: string[] = [];
  for (const match of line.matchAll(ANNOTATION)) {
    out.push(match[0].slice(1, -1).trim().toLowerCase());
  }
  return out;
}

function toMod(line: string, isImplicit: boolean): ParsedMod {
  const annotations = extractAnnotations(line);
  const stripped = line.replace(ANNOTATION, "").trim();
  const text = resolveRangeSpans(stripped, rangePosOf(annotations));
  const values = (text.match(NUMBER) ?? []).map(Number);
  const template = text.replace(NUMBER, "#");
  return { text, template, values, type: detectModType(annotations, isImplicit) };
}

function normalizeRarity(value: string): Rarity {
  switch (value.trim().toLowerCase()) {
    case "normal":
      return "normal";
    case "magic":
      return "magic";
    case "rare":
      return "rare";
    case "unique":
      return "unique";
    case "gem":
      return "gem";
    case "currency":
    case "divination card":
      return "currency";
    default:
      return "normal";
  }
}

export function parseItemText(raw: string, slot?: string): ParsedItem | null {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\r$/, "").trimEnd())
    .filter((l, i, arr) => !(l === "" && (i === 0 || arr[i - 1] === "")));

  // Drop separator lines used in some exports.
  const body = lines.filter((l) => l.trim() !== "" && !/^-{3,}$/.test(l));
  if (body.length === 0) return null;

  const rarityMeta = asMeta(body[0]);
  if (!rarityMeta || rarityMeta.key !== "rarity") return null;
  const rarity = normalizeRarity(rarityMeta.value);

  // Name / base type: the lines between rarity and the first metadata-shaped line.
  let cursor = 1;
  const heading: string[] = [];
  while (
    cursor < body.length &&
    asMeta(body[cursor]) === null &&
    !META_SHAPED.test(body[cursor].replace(ANNOTATION, "").trim())
  ) {
    heading.push(body[cursor].replace(ANNOTATION, "").trim());
    cursor++;
  }
  if (heading.length === 0) return null;
  const hasSeparateName = rarity === "rare" || rarity === "unique";
  const name = heading[0];
  let baseType =
    hasSeparateName && heading.length > 1 ? heading[1] : heading[0];
  // Magic items carry affixes in their single name line ("Turquoise Amulet of
  // the Fox"). Strip the "of …" suffix so trade `type` gets a real base type.
  if (rarity === "magic") baseType = baseType.replace(/\s+of\s+.+$/i, "");

  // Metadata block.
  let itemLevel: number | undefined;
  let quality: number | undefined;
  let sockets: string | undefined;
  let levelReq: number | undefined;
  let implicitCount = 0;
  let selectedVariant: number | undefined;
  let corrupted = false;
  const influences: string[] = [];
  const defences: NonNullable<ParsedItem["defences"]> = {};

  for (; cursor < body.length; cursor++) {
    const meta = asMeta(body[cursor]);
    if (meta) {
      switch (meta.key) {
        case "item level":
        case "itemlevel":
          itemLevel = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "quality":
          quality = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "sockets":
          sockets = meta.value || undefined;
          break;
        case "levelreq":
          levelReq = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "implicits":
          implicitCount = Number.parseInt(meta.value, 10) || 0;
          break;
        case "selected variant":
          selectedVariant = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "armour":
          defences.armour = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "evasion":
        case "evasion rating":
          defences.evasion = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "energy shield":
          defences.energyShield = Number.parseInt(meta.value, 10) || undefined;
          break;
        case "ward":
          defences.ward = Number.parseInt(meta.value, 10) || undefined;
          break;
        default:
          break;
      }
      continue;
    }
    // Unknown line that still looks like `Key: value` (e.g. `Rune: ...`) → skip.
    const cleanedMeta = body[cursor].replace(ANNOTATION, "").trim();
    if (META_SHAPED.test(cleanedMeta)) continue;
    // Bare flag lines ("Shaper Item", "Mirrored", …) appear before Item
    // Level/Quality/Implicits — record and keep scanning so those still parse.
    const infMeta = cleanedMeta.match(INFLUENCE_LINE);
    if (infMeta) {
      influences.push(infMeta[1]);
      continue;
    }
    if (FLAG_LINE.test(cleanedMeta)) continue;
    // Uniques with variant bases repeat the base-type line (e.g.
    // `{variant:2}Two-Toned Boots (…)`) between metadata lines — skip them so
    // later metadata (Quality, Implicits, …) still gets parsed.
    const metaVariants = variantIds(extractAnnotations(body[cursor]));
    if (metaVariants && selectedVariant !== undefined && !metaVariants.includes(selectedVariant)) {
      continue;
    }
    if (cleanedMeta === baseType) continue;
    break; // first real mod
  }

  // Remaining lines are mods (plus a possible trailing `Corrupted`).
  const mods: ParsedMod[] = [];
  const unparsed: string[] = [];
  let modIndex = 0;

  for (; cursor < body.length; cursor++) {
    const line = body[cursor];
    const annotations = extractAnnotations(line);

    // Skip variant lines that do not belong to the selected variant.
    const variants = variantIds(annotations);
    if (variants && selectedVariant !== undefined && !variants.includes(selectedVariant)) {
      continue;
    }

    const cleaned = line.replace(ANNOTATION, "").trim();
    if (cleaned === "") continue;
    // `Corrupted` may carry annotations (e.g. `{variant:2}Corrupted`), so test
    // after stripping them and after variant filtering.
    if (/^corrupted$/i.test(cleaned)) {
      corrupted = true;
      continue;
    }
    // Item-property flag lines are not mods.
    const influence = cleaned.match(INFLUENCE_LINE);
    if (influence) {
      influences.push(influence[1]);
      continue;
    }
    if (FLAG_LINE.test(cleaned)) continue;
    if (cleaned === baseType) continue;
    // Skip affix-detail / metadata lines that some exports interleave with mods
    // (e.g. "Prefix:", "Suffix:", "Unique ID:") — they'd otherwise show as junk.
    if (asMeta(line) !== null) continue;
    // Skip stray "null"/placeholder lines.
    if (/^null$/i.test(cleaned)) continue;

    const isImplicit = modIndex < implicitCount;
    mods.push(toMod(line, isImplicit));
    modIndex++;
  }

  return {
    raw,
    rarity,
    name,
    baseType,
    category: categorize(slot, baseType, rarity),
    slot,
    itemLevel,
    quality,
    sockets,
    levelReq,
    defences: Object.keys(defences).length > 0 ? defences : undefined,
    influences: influences.length > 0 ? influences : undefined,
    corrupted,
    mods,
    unparsed,
  };
}
