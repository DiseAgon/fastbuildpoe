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
]);

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
  const text = line.replace(ANNOTATION, "").trim();
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
  const baseType =
    hasSeparateName && heading.length > 1 ? heading[1] : heading[0];

  // Metadata block.
  let itemLevel: number | undefined;
  let quality: number | undefined;
  let sockets: string | undefined;
  let levelReq: number | undefined;
  let implicitCount = 0;
  let selectedVariant: number | undefined;
  let corrupted = false;
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
    if (META_SHAPED.test(body[cursor].replace(ANNOTATION, "").trim())) continue;
    break; // first real mod
  }

  // Remaining lines are mods (plus a possible trailing `Corrupted`).
  const mods: ParsedMod[] = [];
  const unparsed: string[] = [];
  let modIndex = 0;

  for (; cursor < body.length; cursor++) {
    const line = body[cursor];
    if (/^corrupted$/i.test(line.trim())) {
      corrupted = true;
      continue;
    }

    const annotations = extractAnnotations(line);

    // Skip variant lines that do not belong to the selected variant.
    const variants = variantIds(annotations);
    if (variants && selectedVariant !== undefined && !variants.includes(selectedVariant)) {
      continue;
    }

    const cleaned = line.replace(ANNOTATION, "").trim();
    if (cleaned === "") continue;

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
    corrupted,
    mods,
    unparsed,
  };
}
