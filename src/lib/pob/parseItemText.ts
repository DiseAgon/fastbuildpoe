import type { ModAffix, ModSource, ModType, ParsedItem, ParsedMod, Rarity } from "@/types/item";
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
 * {tags:...}, {custom}, {mutated}. Variant lines are filtered to the item's selected variant.
 */

const NUMBER = /[+-]?\d+(?:\.\d+)?/g;
const ANNOTATION = /\{[^}]*\}/g;
/**
 * PoB unrolled range: `(10-25)% increased …`, `+(16-24) to …`, `-(20-10)% to …`.
 *
 * Either bound may itself be negative — a span that straddles zero is how PoB
 * writes the swingy uniques (`(-35-35)% reduced Duration` on Progenesis,
 * `+(-25-50)% to Fire Resistance` on Ventor's Gamble). Requiring a digit right
 * after `(` left those spans unresolved, so the mod rendered as the raw
 * `(-35-35)%` text and its template came out `(##)%`, which matches no trade
 * stat — the item's headline mod silently became unsearchable.
 */
const RANGE_SPAN = /(-?)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;

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

/**
 * PoB keeps stats whose roll crosses zero in one grammatical form, such as
 * `(-35-35)% reduced Duration`. Once the range is resolved, a negative
 * reduction is an increase; displaying `-7% reduced Duration` is both awkward
 * and, more importantly, makes the trade builder choose the wrong bound.
 */
function normalizeNegativeModifier(text: string): string {
  return text
    .replace(/-([0-9]+(?:\.[0-9]+)?)(%?)\s+reduced\b/gi, "$1$2 increased")
    .replace(/-([0-9]+(?:\.[0-9]+)?)(%?)\s+increased\b/gi, "$1$2 reduced");
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
  "selected variant group",
  "selected version",
  "selected alt variant",
  "selected alt variant two",
  "selected alt variant three",
  "selected alt variant four",
  "selected alt variant five",
  "has alt variant two",
  "has alt variant three",
  "has alt variant four",
  "has alt variant five",
  "allow duplicate variants",
  "version",
  "variant",
  "league",
  "memory strands",
  "note",
  "unreleased",
  "upgrade",
  "intangibility",
  "cluster jewel skill",
  "cluster jewel node count",
  "armourbasepercentile",
  "evasionbasepercentile",
  "energyshieldbasepercentile",
  "wardbasepercentile",
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
const FLAG_LINE =
  /^(Synthesised Item|Fractured Item|Vestigial Item|Foulborn Item|Mirrored|Split|Unidentified|Veiled Prefix|Veiled Suffix|Double Corrupted|Foil Unique(?: \([^)]*\))?)$/i;
/** Slot label / hint on a game-clipboard Viscera. Not a modifier. */
const VISCERA_LABEL = /^(Head|Torso|Upper Limb|Lower Limb)$/;
const WICKERMAN_HINT = /^Take this to the Wickerman\b/i;
/**
 * Class restriction. PoB writes it both above the `Implicits:` count and as a
 * mod line below it, and it is counted in neither — treating it as a mod ended
 * the metadata scan early (losing the implicit count) or shifted every mod's
 * implicit/explicit classification by one.
 */
const CLASS_REQUIREMENT_LINE = /^Requires Class\b/i;

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

/**
 * PoB tags a mod's kind inline; only untagged lines have to be classified by
 * position. `{crucible}` is checked first because PoB's own re-parse can file a
 * crucible line into the implicit block (Item.lua tests `implicit` before
 * `crucible`), which would otherwise make it look like the item's implicit.
 */
function detectModType(annotations: string[], isImplicit: boolean): ModType {
  if (annotations.includes("crucible")) return "crucible";
  if (annotations.includes("crafted")) return "crafted";
  if (annotations.includes("fractured")) return "fractured";
  if (annotations.includes("scourge")) return "scourge";
  if (annotations.includes("enchant")) return "enchant";
  if (annotations.includes("implicit")) return "implicit";
  return isImplicit ? "implicit" : "explicit";
}

function idList(raw: string): number[] {
  return raw
    .split(",")
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/** `{variant:}` / `{group:}` / `{version:}` on one PoB line. Absent means "no tag". */
interface LineVariant {
  variants: number[] | null;
  groups: number[] | null;
  versions: number[] | null;
}

function lineVariant(annotations: string[]): LineVariant {
  let variants: number[] | null = null;
  let groups: number[] | null = null;
  let versions: number[] | null = null;
  for (const a of annotations) {
    if (a.startsWith("variant:")) variants = idList(a.slice("variant:".length));
    else if (a.startsWith("group:")) groups = idList(a.slice("group:".length));
    else if (a.startsWith("version:")) versions = idList(a.slice("version:".length));
  }
  return { variants, groups, versions };
}

/**
 * Which variant lines belong on the item. Mirrors PoB `CheckModLineVariant`.
 *
 * 3.30 uniques select mods with `Selected Variant Group` / `Selected Version`
 * instead of one `Selected Variant`. Keeping every `{variant:}` line makes a
 * trade search require mutually exclusive mods.
 */
interface VariantSelection {
  usesGroups: boolean;
  selectedVariant?: number;
  altVariants: number[];
  selectedVersion?: number;
  groups: Map<number, number>;
}

const ALT_VARIANT_KEYS = [
  "selected alt variant",
  "selected alt variant two",
  "selected alt variant three",
  "selected alt variant four",
  "selected alt variant five",
];

function readVariantSelection(body: string[]): VariantSelection {
  const groups = new Map<number, number>();
  const altVariants: number[] = [];
  let selectedVariant: number | undefined;
  let selectedVersion: number | undefined;
  let usesGroups = false;
  for (const line of body) {
    const annotations = extractAnnotations(line);
    if (annotations.some((a) => a.startsWith("group:") || a.startsWith("version:"))) {
      usesGroups = true;
    }
    const meta = asMeta(line);
    if (!meta) continue;
    if (meta.key === "selected variant") {
      const n = Number.parseInt(meta.value, 10);
      if (Number.isFinite(n)) selectedVariant = n;
    } else if (meta.key === "selected version") {
      usesGroups = true;
      const n = Number.parseInt(meta.value, 10);
      if (Number.isFinite(n)) selectedVersion = n;
    } else if (meta.key === "selected variant group") {
      usesGroups = true;
      const match = meta.value.match(/^(\d+)\s*=\s*(\d+)$/);
      if (match) groups.set(Number(match[1]), Number(match[2]));
    } else if (ALT_VARIANT_KEYS.includes(meta.key)) {
      const n = Number.parseInt(meta.value, 10);
      if (Number.isFinite(n)) altVariants.push(n);
    }
  }
  return { usesGroups, selectedVariant, altVariants, selectedVersion, groups };
}

/** PoB `CheckModLineVariant`: drop lines that belong to another variant. */
function keepVariantLine(spec: LineVariant, sel: VariantSelection): boolean {
  if (sel.usesGroups) {
    if (
      spec.versions &&
      (sel.selectedVersion === undefined || !spec.versions.includes(sel.selectedVersion))
    ) {
      return false;
    }
    if (spec.groups) {
      if (!spec.variants) return false;
      for (const groupId of spec.groups) {
        const picked = sel.groups.get(groupId);
        if (picked !== undefined && spec.variants.includes(picked)) return true;
      }
      return false;
    }
    return !spec.variants;
  }
  if (!spec.variants) return true;
  const selected = [sel.selectedVariant, ...sel.altVariants].filter(
    (n): n is number => n !== undefined,
  );
  // No selection at all: old exports that list variants but never pick one.
  if (selected.length === 0) return true;
  return spec.variants.some((id) => selected.includes(id));
}

function extractAnnotations(line: string): string[] {
  const out: string[] = [];
  for (const match of line.matchAll(ANNOTATION)) {
    out.push(match[0].slice(1, -1).trim().toLowerCase());
  }
  return out;
}

/** PoB tags the affix slot when it knows the item's mod roll ("{prefix}+77 to Armour"). */
function detectAffix(annotations: string[]): ModAffix | undefined {
  if (annotations.includes("prefix")) return "prefix";
  if (annotations.includes("suffix")) return "suffix";
  return undefined;
}

function detectModSource(annotations: string[]): ModSource | undefined {
  if (annotations.includes("mutated")) return "foulborn";
  if (annotations.includes("exarch")) return "searing";
  if (annotations.includes("eater")) return "eater";
  if (annotations.includes("vestigial")) return "vestigial";
  return undefined;
}

function toMod(line: string, isImplicit: boolean): ParsedMod {
  const annotations = extractAnnotations(line);
  const stripped = line.replace(ANNOTATION, "").trim();
  const text = normalizeNegativeModifier(
    resolveRangeSpans(stripped, rangePosOf(annotations)),
  );
  const values = (text.match(NUMBER) ?? []).map(Number);
  const template = text.replace(NUMBER, "#");
  return {
    text,
    template,
    values,
    type: detectModType(annotations, isImplicit),
    affix: detectAffix(annotations),
    source: detectModSource(annotations),
  };
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
    .replace(/\u200b/g, "")
    .split("\n")
    .map((l) => l.replace(/\r$/, "").trim())
    .filter((l, i, arr) => !(l === "" && (i === 0 || arr[i - 1] === "")));

  // Drop separator lines used in some exports.
  const body = lines.filter((l) => l.trim() !== "" && !/^-{3,}$/.test(l));
  if (body.length === 0) return null;

  // Game clipboard (3.30+) leads with `Item Class:` before `Rarity:`. Viscera
  // can omit Rarity entirely; PoB treats that as a normal item.
  let itemClass: string | undefined;
  if (/^item class:/i.test(body[0].replace(ANNOTATION, "").trim())) {
    itemClass = body[0].replace(ANNOTATION, "").replace(/^item class:\s*/i, "").trim();
    body.shift();
  }
  if (body.length === 0) return null;

  const rarityMeta = asMeta(body[0]);
  let rarity: Rarity;
  let cursor: number;
  if (rarityMeta?.key === "rarity") {
    rarity = normalizeRarity(rarityMeta.value);
    cursor = 1;
  } else if (itemClass && /viscera/i.test(itemClass)) {
    rarity = "normal";
    cursor = 0;
  } else {
    return null;
  }
  // PoB's item set names these slots Head / Body / Arm / Leg (ItemsTab),
  // not "Wickerman Head". The game clipboard uses Item Class: Viscera.
  const visceraItem =
    /^(?:wickerman\b.*|head|body|arm|leg)$/i.test(slot ?? "") ||
    /viscera/i.test(itemClass ?? "");
  const selection = readVariantSelection(body);
  const isNonModLabel = (line: string): boolean => {
    const cleaned = line.replace(ANNOTATION, "").trim();
    if (WICKERMAN_HINT.test(cleaned)) return true;
    return visceraItem && VISCERA_LABEL.test(cleaned);
  };

  // Name / base type sit before the first known metadata key. A rare's name
  // may itself contain a colon ("Leveling: minion wand"); stopping on every
  // `Key: value` line drops the item. Unknown keys are skipped later.
  const heading: string[] = [];
  while (
    cursor < body.length &&
    asMeta(body[cursor]) === null &&
    !INFLUENCE_LINE.test(body[cursor].replace(ANNOTATION, "").trim()) &&
    !FLAG_LINE.test(body[cursor].replace(ANNOTATION, "").trim()) &&
    !CLASS_REQUIREMENT_LINE.test(body[cursor].replace(ANNOTATION, "").trim()) &&
    !isNonModLabel(body[cursor])
  ) {
    heading.push(body[cursor].replace(ANNOTATION, "").trim());
    cursor++;
  }
  if (heading.length === 0) return null;
  const hasSeparateName = rarity === "rare" || rarity === "unique";
  const name = heading[0];
  let baseType =
    hasSeparateName && heading.length > 1 ? heading[1] : heading[0];
  // Curse of the Allflame displays the transformed base as, for example,
  // "Vestigial Sage's Robe". The official trade `type` remains "Sage's Robe"
  // and exposes Vestigial as a separate misc filter, so keep the property and
  // normalize the base before categorisation/searching.
  const vestigial =
    /^vestigial\s+/i.test(baseType) ||
    body.some((line) => /^vestigial item$/i.test(line.replace(ANNOTATION, "").trim()));
  if (vestigial) baseType = baseType.replace(/^vestigial\s+/i, "");
  const foulbornByNameOrFlag =
    rarity === "unique" &&
    (/^foulborn\s+/i.test(name) ||
      body.some((line) => /^foulborn item$/i.test(line.replace(ANNOTATION, "").trim())));
  // Magic items carry affixes in their single name line ("Turquoise Amulet of
  // the Fox"). Strip the "of …" suffix so trade `type` gets a real base type.
  if (rarity === "magic") baseType = baseType.replace(/\s+of\s+.+$/i, "");

  // Metadata block.
  let itemLevel: number | undefined;
  let quality: number | undefined;
  let sockets: string | undefined;
  let levelReq: number | undefined;
  let implicitCount = 0;
  let passedImplicits = false;
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
          passedImplicits = true;
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
    if (FLAG_LINE.test(cleanedMeta)) {
      if (/^double corrupted$/i.test(cleanedMeta)) corrupted = true;
      continue;
    }
    if (CLASS_REQUIREMENT_LINE.test(cleanedMeta)) continue;
    if (isNonModLabel(body[cursor])) continue;
    // 3.30 writes every variant base (`{group:1}{variant:2}Sapphire Ring`)
    // before Quality/Implicits. Treating a non-selected one as the first mod
    // stops the scan, so Implicits never parses and every mod is required.
    // A variant line with no number after Implicits is a real mod (Impossible
    // Escape). Only the pre-Implicits lines are alternate base names.
    const metaSpec = lineVariant(extractAnnotations(body[cursor]));
    const metaTagged =
      metaSpec.variants !== null || metaSpec.groups !== null || metaSpec.versions !== null;
    if (!passedImplicits && metaTagged && !/\d/.test(cleanedMeta)) {
      if (keepVariantLine(metaSpec, selection)) {
        const nextBase = cleanedMeta.replace(/^(superior|synthesised|vestigial)\s+/i, "");
        if (nextBase) baseType = nextBase;
      }
      continue;
    }
    if (metaTagged && !keepVariantLine(metaSpec, selection)) continue;
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
    const cleaned = line.replace(ANNOTATION, "").trim();
    if (cleaned === "") continue;
    // `Corrupted` may carry annotations (e.g. `{variant:2}Corrupted`), so test
    // after stripping them. An unselected variant must not flip the flag.
    if (/^corrupted$/i.test(cleaned)) {
      if (keepVariantLine(lineVariant(annotations), selection)) corrupted = true;
      continue;
    }
    if (/^double corrupted$/i.test(cleaned)) {
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
    if (CLASS_REQUIREMENT_LINE.test(cleaned)) continue;
    if (isNonModLabel(line)) continue;
    if (cleaned === baseType) continue;
    // Skip affix-detail / metadata lines that some exports interleave with mods
    // (e.g. "Prefix:", "Suffix:", "Unique ID:") — they'd otherwise show as junk.
    if (asMeta(line) !== null) continue;
    // Skip stray "null"/placeholder lines.
    if (/^null$/i.test(cleaned)) continue;

    /**
     * `Implicits: N` counts every enchant + scourge + implicit line PoB wrote,
     * including variants this build did not select. A dropped line still has
     * to consume that budget, or the next explicit is classified as implicit.
     * Crucible passives are excluded from the count but can sit among the
     * implicits — letting one take a slot pushed the real implicit out.
     */
    const isCrucible = annotations.includes("crucible");
    if (annotations.includes("disabled") || !keepVariantLine(lineVariant(annotations), selection)) {
      if (!isCrucible) modIndex++;
      continue;
    }
    const isImplicit = !isCrucible && modIndex < implicitCount;
    mods.push(toMod(line, isImplicit));
    if (!isCrucible) modIndex++;
  }

  // Current PoB writes `{exarch}` / `{eater}` on the exact implicit line. Old
  // exports may only carry the item-level influence flags; in that case all
  // implicit lines on this rare armour are treated conservatively as Eldritch
  // so they do not become accidental default requirements.
  const hasEldritchInfluence = influences.some(
    (influence) => influence === "Searing Exarch" || influence === "Eater of Worlds",
  );
  const hasTaggedEldritch = mods.some(
    (mod) => mod.source === "searing" || mod.source === "eater",
  );
  if (rarity === "rare" && hasEldritchInfluence && !hasTaggedEldritch) {
    for (const mod of mods) {
      if (mod.type === "implicit") mod.source = "eldritch";
    }
  }
  const foulborn =
    foulbornByNameOrFlag || mods.some((mod) => mod.source === "foulborn");

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
    vestigial: vestigial || undefined,
    foulborn: foulborn || undefined,
    corrupted,
    mods,
    unparsed,
  };
}
