import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import { getStatIndex, matchMod, normalizeStatText, type StatIndex } from "./statIndex";
import { computePseudoFilters, pseudoCoversFilter, type PseudoFamily } from "./pseudo";
import { MOD_FAMILIES } from "./groups";
import { getWeaponBase, getWeaponTradeCategory } from "./weaponBase";
import { computeWeaponDps } from "./weaponDps";
import { resolveGemType } from "./gemTypes";
import { emptySocketOptions, type SocketOptions } from "./socketOptions";
import { uniqueJewelVariant } from "./uniqueJewelVariants";

export type { SocketOptions } from "./socketOptions";

/**
 * Roll axis — seeds each filter's minimum at this share of the item's own roll
 * (see `lib/trade/roll.ts`). Everything else about the search is chosen per mod
 * in the UI: Must / Any / Exclude per line, and a threshold per optional pool.
 */
export type RollPercent = number;
export type BaseScope = "exact" | "slot" | "any";

/**
 * Share of an optional pool that must match by default.
 *
 * Not on the slider: the slider answers "how good a roll", this answers "how
 * many mods", and the per-pool thresholds in the Advanced panel already expose
 * it directly. 0.6 is the value the old default preset used, so an untouched
 * search returns what it always did.
 */
const BAND_FRACTION = 0.6;

/** Per-mod group assignment, mapping to the trade API stat group types. */
export type FilterGroup = "and" | "count" | "not" | "off";

/**
 * Which pool an optional mod counts toward.
 *
 * A single "any N of all mods" group lets every match come from one class —
 * an item with the right implicit and nothing else satisfies "any 3 of 8". The
 * trade API takes any number of stat groups, so optional mods are split by
 * where the mod comes from and each pool carries its own threshold. That turns
 * one loose quota into a guarantee per class.
 *
 * `other` is explicit mods whose affix slot PoB did not record — most items,
 * since the annotations only exist when the item was copied with advanced mod
 * info. It stays one pool rather than being guessed at.
 */
export type StatBand = "implicit" | "prefix" | "suffix" | "other";

export const BAND_ORDER: StatBand[] = ["implicit", "prefix", "suffix", "other"];

export const BAND_LABEL: Record<StatBand, string> = {
  implicit: "Implicit",
  prefix: "Prefix",
  suffix: "Suffix",
  // Not "Explicit": single-mod bands fold in here, so this pool can hold an
  // implicit and calling it explicit would be a lie on screen.
  other: "Mods",
};

/** One optional-mod pool, surfaced so the UI can show and tune its threshold. */
export interface BandInfo {
  key: StatBand;
  label: string;
  total: number;
  min: number;
}

/** The slider's percentage as the multiplier applied to each roll. */
const factorOf = (rollPercent: RollPercent): number =>
  Math.min(1, Math.max(0, rollPercent / 100));

/** One editable filter row, surfaced to the UI so the user can adjust it. */
export interface EditableFilter {
  statId: string;
  text: string;
  /** The item's actual roll (first value), for display. */
  currentRoll: number | null;
  min: number | null;
  max: number | null;
  /** and = required · count = optional (any N) · not = must NOT have · off = ignore. */
  group: FilterGroup;
  /** Search the fractured variant of this mod (uses fracturedStatId). */
  fractured: boolean;
  /** Fractured stat id for this mod, if one exists (else null → no Frac toggle). */
  fracturedStatId: string | null;
  /** Trade option id for option-valued stats (min/max don't apply). */
  option?: number | null;
  /** Which optional-mod pool this counts toward when `group` is "count". */
  band: StatBand;
  /** Special item mechanic that produced this modifier. */
  source?: ParsedItem["mods"][number]["source"];
  /** Additional PoB lines consumed by this one multi-line trade stat. */
  continuations?: string[];
  /** Discriminator/option/seed that selects a materially different unique. */
  variantDefining?: boolean;
}

/** A computed equipment filter — armour defences or weapon DPS. */
export interface EquipmentFilter {
  /** Trade field key: es/ev/ar/ward (armour) or dps/pdps/edps/aps/crit (weapon). */
  field: string;
  label: string;
  /** Whether this targets the armour or weapon filter group. */
  group: "armour" | "weapon";
  itemValue: number;
  min: number | null;
  max: number | null;
  include: boolean;
}

/** A pseudo "total" aggregate filter (e.g. Total Elemental Resistance). */
export interface PseudoFilter {
  statId: string;
  label: string;
  itemValue: number;
  min: number | null;
  max: number | null;
  include: boolean;
  /** Mutually exclusive family for overlapping totals (currently resistances). */
  family?: PseudoFamily;
}

export interface QueryOverrides {
  /** Per-band thresholds, keyed by band. Absent bands keep their default. */
  bandMins?: Partial<Record<StatBand, number>>;
  filters?: EditableFilter[];
  equipment?: EquipmentFilter[];
  pseudo?: PseudoFilter[];
  /** Restrict to listings with a fixed buyout price (default true). */
  buyout?: boolean;
  /** Exact base, same equipment slot/class, or no type restriction. */
  baseScope?: BaseScope;
  /** Backward compatibility with saved/in-flight clients. */
  useBase?: boolean;
  socket?: SocketOptions;
  /** Gem search options (min level/quality/sockets). null = omit that filter. */
  gem?: { level: number | null; quality: number | null; sockets: number | null };
}

export interface TradeStatFilter {
  id: string;
  value?: { min?: number; max?: number; option?: number };
  /** Present in the group but unchecked on the trade site (sibling family members). */
  disabled?: boolean;
}

interface FamilyInfo {
  key: string;
  label: string;
  memberIds: string[];
  exact: boolean;
  interchangeable: boolean;
}

/** Resolve each mod family's member stat ids for this game (skips missing). */
function resolveFamilies(index: StatIndex): Map<string, FamilyInfo> {
  const byStatId = new Map<string, FamilyInfo>();
  for (const fam of MOD_FAMILIES) {
    const memberIds: string[] = [];
    for (const text of fam.texts) {
      const entry = index.byText
        .get(normalizeStatText(text))
        ?.find((c) => c.entry.type === "explicit")?.entry;
      if (entry && !memberIds.includes(entry.id)) memberIds.push(entry.id);
    }
    if (memberIds.length < 2) continue; // need siblings to be worth expanding
    const info: FamilyInfo = {
      key: fam.key,
      label: fam.label,
      memberIds,
      exact: !!fam.exact,
      interchangeable: !!fam.interchangeable,
    };
    for (const id of memberIds) byStatId.set(id, info);
  }
  return byStatId;
}

export interface TradeStatGroup {
  type: "and" | "count" | "not" | "weight";
  filters: TradeStatFilter[];
  value?: { min?: number; max?: number };
}

/**
 * Trade `type` is either a plain base type or, for gems that share one base
 * across several variants (transfigured skills), the base plus the
 * discriminator that picks the variant.
 */
export type TradeType = string | { option: string; discriminator: string };

export interface TradeQuery {
  status: { option: string };
  name?: string;
  type?: TradeType;
  stats: TradeStatGroup[];
  filters: Record<string, { filters: Record<string, unknown> }>;
}

export interface BuiltQuery {
  query: TradeQuery;
  matched: number;
  unmatched: number;
  /** Optional-mod pools actually present on this item, in display order. */
  bands: BandInfo[];
  filters: EditableFilter[];
  equipment: EquipmentFilter[];
  pseudo: PseudoFilter[];
  baseScope: BaseScope;
  socket: SocketOptions;
  strategy: string;
}

/** A roll floor at `factor` of the item's roll; null when there is no floor. */
function bandedMin(value: number | undefined, factor: number): number | null {
  // factor 0 is the slider at its left end: search the mod, ignore the roll.
  if (value === undefined || value <= 0 || factor <= 0) return null;
  return Math.max(1, Math.floor(value * factor));
}

/**
 * PoB splits Two-Toned Boots into three bases distinguished by a defence
 * parenthetical ("Two-Toned Boots (Armour/Evasion)") because it needs the
 * defence values; trade has one "Two-Toned Boots" and answers the qualified
 * name with "Unknown item base type".
 *
 * Matched by the defence shape rather than by any trailing parenthetical: no
 * PoE1 base type contains one, but 72 PoE2 entries do ("Uncut Spirit Gem
 * (Level 10)"), and those are real type names.
 */
const DEFENCE_VARIANT =
  /\s*\((?:Armour|Evasion|Energy Shield|Ward)(?:\s*\/\s*(?:Armour|Evasion|Energy Shield|Ward))+\)$/i;

function tradeBaseType(baseType: string): string {
  return baseType.replace(DEFENCE_VARIANT, "");
}

/** Official trade category that best represents “same slot/class”. */
function tradeCategory(game: GameId, item: ParsedItem): string | null {
  const slot = item.slot ?? "";
  const base = item.baseType;
  if (/helmet/i.test(slot)) return "armour.helmet";
  if (/body armour/i.test(slot)) return "armour.chest";
  if (/gloves/i.test(slot)) return "armour.gloves";
  if (/boots/i.test(slot)) return "armour.boots";
  if (/amulet/i.test(slot)) return "accessory.amulet";
  if (/ring/i.test(slot)) return "accessory.ring";
  if (/belt/i.test(slot)) return "accessory.belt";
  if (/shield/i.test(base)) return "armour.shield";
  if (/quiver/i.test(base)) return "armour.quiver";
  const weaponCategory = getWeaponTradeCategory(game, base);
  if (weaponCategory) return weaponCategory;
  if (/weapon/i.test(slot)) return "weapon";
  if (item.category === "jewel") return "jewel";
  if (item.category === "flask") return "flask";
  if (item.category === "charm") return "flask.charm";
  return null;
}

function defaultSockets(): SocketOptions {
  return emptySocketOptions();
}

/** Raw local rolls already represented by final defence/DPS property filters. */
function coveredByEquipment(item: ParsedItem, filter: EditableFilter, equipment: EquipmentFilter[]): boolean {
  if (item.rarity === "unique" || filter.band === "implicit") return false;
  const enabled = new Set(equipment.filter((row) => row.include).map((row) => row.field));
  const t = filter.text.toLowerCase();
  const armourSlot = /helmet|body armour|gloves|boots/i.test(item.slot ?? "") || /shield/i.test(item.baseType);
  // Flat ES on an armour base is local and already included in the final ES
  // property. The same wording on jewellery is global, so slot context matters.
  if (armourSlot && enabled.has("es") && /\bto maximum energy shield\b/.test(t) && !/% increased/.test(t)) {
    return true;
  }
  const defence = /\b(?:armour|evasion|energy shield|ward)\b/.test(t);
  if (defence && !/maximum|recharge|recovery|regenerat|leech|stun|block/.test(t)) {
    if (/armour/.test(t) && enabled.has("ar")) return true;
    if (/evasion/.test(t) && enabled.has("ev")) return true;
    if (/energy shield/.test(t) && enabled.has("es")) return true;
    if (/ward/.test(t) && enabled.has("ward")) return true;
  }
  if (enabled.has("pdps") && /(?:adds .* physical damage|increased physical damage)/.test(t)) return true;
  if (enabled.has("edps") && /adds .* (?:fire|cold|lightning) damage/.test(t)) return true;
  if (enabled.has("aps") && /attack speed/.test(t)) return true;
  if (enabled.has("crit") && /critical strike chance/.test(t) && !/global/.test(t)) return true;
  return false;
}

/**
 * Extract a searchable flask base type from a (possibly magic) flask name.
 * Magic flasks carry a prefix + suffix, e.g.
 *   "Seething Ultimate Life Flask of the Mixologist" → "Ultimate Life Flask".
 * Utility flasks (PoE1) are "<base> Flask", e.g.
 *   "Chemist's Quicksilver Flask of Adrenaline" → "Quicksilver Flask".
 */
function consumableBase(name: string): string {
  const lifeMana = name.match(/(\S+)\s+(Life|Mana)\s+Flask/i);
  if (lifeMana) return `${lifeMana[1]} ${lifeMana[2]} Flask`;
  const flask = name.match(/(\S+)\s+Flask/i);
  if (flask) return `${flask[1]} Flask`;
  const charm = name.match(/(\S+)\s+Charm/i);
  if (charm) return `${charm[1]} Charm`;
  return name;
}

/**
 * The pool a mod counts toward. Implicit-class mods are item-intrinsic (you
 * cannot craft them onto a base), so they are separated from affixes even when
 * PoB tells us nothing about affix slots — which is the common case.
 */
function bandOf(mod: { type: string; affix?: "prefix" | "suffix" }): StatBand {
  if (mod.type === "implicit" || mod.type === "enchant" || mod.type === "scourge") {
    return "implicit";
  }
  if (mod.affix === "prefix") return "prefix";
  if (mod.affix === "suffix") return "suffix";
  return "other";
}

async function autoFilters(
  game: GameId,
  item: ParsedItem,
  factor: number,
): Promise<{ filters: EditableFilter[]; unmatched: number }> {
  const index = await getStatIndex(game);
  const families = resolveFamilies(index);
  /**
   * A cluster jewel's passive-skill lines are its *enchantment* on the trade
   * side, and PoB reports them inside the implicit block as {crafted}. Several
   * of them also exist as explicit stats with the same id suffix, and those
   * match nothing: verified against the live API, explicit.stat_3086156145
   * ("Adds # Passive Skills") returns 0 listings where enchant.stat_3086156145
   * returns the whole market. Its real explicit mods (notables, "also grant",
   * "increased Effect") are typed explicit/fractured by PoB and are unaffected.
   */
  const preferTypes =
    /\bcluster jewel\b/i.test(item.baseType) ? ["enchant"] : undefined;

  const filters: EditableFilter[] = [];
  let unmatched = 0;
  let prevTemplate: string | null = null;
  let continuationFilter: EditableFilter | null = null;
  let continuationLines: string[] = [];
  for (const mod of item.mods) {
    if (
      continuationFilter &&
      continuationLines.length > 0 &&
      normalizeStatText(mod.template) === continuationLines[0]
    ) {
      (continuationFilter.continuations ??= []).push(mod.text);
      continuationLines.shift();
      if (continuationLines.length === 0) continuationFilter = null;
      prevTemplate = mod.template;
      continue;
    }
    continuationFilter = null;
    continuationLines = [];

    const hit = matchMod(
      index,
      mod,
      mod.type === "crafted" || mod.type === "implicit" ? preferTypes : undefined,
    );
    if (!hit) {
      // Multi-line stats split into two PoB lines (e.g. "…your tree" +
      // "Passage"): if the joined text matches a stat, the previous filter
      // already covers this line — don't count it as unmatched.
      const joined = prevTemplate
        ? index.byText.get(normalizeStatText(`${prevTemplate} ${mod.template}`))
        : undefined;
      prevTemplate = mod.template;
      if (!joined || joined.length === 0) unmatched++;
      continue;
    }
    prevTemplate = mod.template;
    const fracturedEntry = index.byText
      .get(normalizeStatText(mod.template))
      ?.find((c) => c.entry.type === "fractured")?.entry;
    // Exact-match families (timeless jewel seeds) and discrete unique-jewel
    // variants lock min = max = roll.
    const familyExact = families.get(hit.entry.id)?.exact ?? false;
    const uniqueVariant = uniqueJewelVariant(
      game,
      item,
      hit.entry.text,
      hit.entry.id,
    );
    const exact = familyExact || uniqueVariant.exactRoll;
    const roll = mod.values[0];
    const isOption = hit.option !== undefined;
    // "reduced X" matches the "increased X" stat with negative values on the
    // trade side, so "at least this much reduction" is a max, not a min.
    const negatedMax =
      hit.negated && roll !== undefined && roll > 0 && factor > 0
        ? -Math.max(1, Math.floor(roll * factor))
        : null;
    const filter: EditableFilter = {
      statId: hit.entry.id,
      text: mod.text,
      currentRoll: isOption ? null : (roll ?? null),
      min: isOption ? null : exact ? (roll ?? null) : hit.negated ? null : bandedMin(roll, factor),
      max: isOption ? null : exact ? (roll ?? null) : negatedMax,
      // Optional by default; each line is switchable to Must / Exclude / Off.
      group: "count",
      // Default off: search the mod normally (matches fractured or not). The
      // Frac toggle stays available for users who specifically want fractured.
      fractured: false,
      fracturedStatId: fracturedEntry?.id ?? null,
      option: hit.option ?? null,
      band: bandOf(mod),
      source: mod.source,
      variantDefining:
        item.rarity === "unique" &&
        (isOption || familyExact || uniqueVariant.defining),
    };
    filters.push(filter);

    // Trade stats such as Impossible Escape are one logical stat split across
    // several PoB lines. The index matches their first line; remember and
    // consume the remaining lines so they share this filter instead of showing
    // as separate "NO STAT" rows.
    const tradeLines = hit.entry.text.split("\n").map(normalizeStatText);
    if (
      tradeLines.length > 1 &&
      tradeLines[0] === normalizeStatText(mod.template)
    ) {
      continuationFilter = filter;
      continuationLines = tradeLines.slice(1);
    }
  }
  return { filters, unmatched };
}

const band = (value: number, factor: number): number | null =>
  factor <= 0 ? null : Math.max(1, Math.floor(value * factor));

/** Default computed filters: armour defences + (for weapons) DPS. */
async function autoComputed(
  game: GameId,
  item: ParsedItem,
  factor: number,
): Promise<EquipmentFilter[]> {
  const out: EquipmentFilter[] = [];

  // Armour defences.
  const d = item.defences;
  if (d) {
    const rows: Array<[string, string, number | undefined]> = [
      ["es", "Energy Shield", d.energyShield],
      ["ev", "Evasion", d.evasion],
      ["ar", "Armour", d.armour],
      ["ward", "Ward", d.ward],
    ];
    for (const [field, label, value] of rows) {
      if (value && value > 0) {
        out.push({ field, label, group: "armour", itemValue: value, min: band(value, factor), max: null, include: true });
      }
    }
  }

  // Weapon DPS (only when this base is a weapon).
  if (item.category === "gear") {
    const base = await getWeaponBase(game, item.baseType);
    if (base) {
      const dps = computeWeaponDps(item, base);
      // Decimal band for small values (aps/crit); integer band for DPS.
      const decBand = (v: number): number | null =>
        factor <= 0 ? null : Math.round(v * factor * 10) / 10;
      // Default to the *specific* DPS the weapon actually has (phys/ele) plus
      // attack speed and crit; Total DPS is available but off by default.
      const rows: Array<[string, string, number, number | null, boolean]> = [
        ["pdps", "Phys DPS", dps.pdps, band(dps.pdps, factor), true],
        ["edps", "Ele DPS", dps.edps, band(dps.edps, factor), true],
        ["aps", "Attacks/sec", dps.aps, decBand(dps.aps), true],
        ["crit", "Crit %", dps.crit, decBand(dps.crit), true],
        ["dps", "Total DPS", dps.dps, band(dps.dps, factor), false],
      ];
      for (const [field, label, value, min, include] of rows) {
        if (value > 0) {
          out.push({ field, label, group: "weapon", itemValue: value, min, max: null, include });
        }
      }
    }
  }

  return out;
}

function toStatFilter(f: EditableFilter): TradeStatFilter {
  // Use the fractured variant id when the user marked this mod as fractured.
  const id = f.fractured && f.fracturedStatId ? f.fracturedStatId : f.statId;
  const filter: TradeStatFilter = { id };
  if (f.option !== null && f.option !== undefined) {
    filter.value = { option: f.option };
    return filter;
  }
  const value: { min?: number; max?: number } = {};
  if (f.min !== null && f.min !== undefined) value.min = f.min;
  if (f.max !== null && f.max !== undefined) value.max = f.max;
  if (value.min !== undefined || value.max !== undefined) filter.value = value;
  return filter;
}

export async function buildItemQuery(
  game: GameId,
  item: ParsedItem,
  rollPercent: RollPercent,
  overrides?: QueryOverrides,
): Promise<BuiltQuery> {
  const factor = factorOf(rollPercent);

  let filters: EditableFilter[];
  let unmatched: number;
  if (overrides?.filters) {
    filters = overrides.filters;
    unmatched = 0;
  } else {
    const auto = await autoFilters(game, item, factor);
    // Unique identity is its name. Rolls remain available for opt-in variant
    // searches, but adding all of them by default makes a name search brittle.
    // A Vestigial armour's first implicit is different: it is the transferred
    // donor property that defines this variant, so preserve it as required.
    const vestigialImplicit = item.vestigial
      ? (item.mods.find((mod) => mod.source === "vestigial") ??
        item.mods.find((mod) => mod.type === "implicit"))?.text
      : undefined;
    filters = item.rarity === "unique"
      ? auto.filters.map((filter) => ({
          ...filter,
          group:
            filter.variantDefining ||
            (vestigialImplicit !== undefined && filter.text === vestigialImplicit)
              ? "and" as const
              : "off" as const,
        }))
      : item.rarity === "rare"
        ? auto.filters.map((filter) =>
            filter.source === "searing" ||
            filter.source === "eater" ||
            filter.source === "eldritch"
              ? { ...filter, group: "off" as const }
              : filter,
          )
        : auto.filters;
    unmatched = auto.unmatched;
  }

  const autoEquipment = await autoComputed(game, item, factor);
  const equipment = overrides?.equipment ?? (
    item.rarity === "unique"
      ? autoEquipment.map((row) => ({ ...row, include: false }))
      : autoEquipment
  );
  const computedPseudo = overrides?.pseudo ?? computePseudoFilters(filters, factor);
  // Only one overlapping resistance total can be active. Other pseudo kinds
  // (life + attributes, for example) remain freely combinable.
  const activeFamilies = new Set<string>();
  const pseudo = computedPseudo.map((row) => {
    if (!row.include || !row.family) return row;
    if (activeFamilies.has(row.family)) return { ...row, include: false };
    activeFamilies.add(row.family);
    return row;
  });
  const activePseudo = pseudo.filter((row) => row.include);
  filters = filters.map((filter) =>
    activePseudo.some((row) => pseudoCoversFilter(row.statId, filter.statId)) ||
    coveredByEquipment(item, filter, equipment)
      ? { ...filter, group: "off" as const }
      : filter,
  );

  const baseScope: BaseScope =
    overrides?.baseScope ??
    (overrides?.useBase !== undefined
      ? overrides.useBase ? "exact" : "any"
      : item.rarity === "unique" ? "any" : "exact");
  const socket = overrides?.socket ?? defaultSockets();

  // An item has only one fractured mod, so AND-ing several fractured choices
  // finds nothing. When the user marks 2+ as fractured, collapse them into a
  // "any 1 of these fractured" count group instead (more variable matching).
  const fracMulti = filters.filter(
    (f) => f.group !== "off" && f.fractured && f.fracturedStatId,
  );
  const useFracCount = fracMulti.length >= 2;
  const inFracCount = (f: EditableFilter) => useFracCount && f.fractured && !!f.fracturedStatId;

  // Same-kind family siblings are appended disabled to their existing band.
  // Keeping the active members in Prefix/Suffix/Implicit preserves that band's
  // similarity threshold; pulling them into a separate family group used to
  // turn two resistances into "both required" even when the suffix pool asked
  // for only one.
  const familyByStatId = resolveFamilies(await getStatIndex(game));
  const inInterchangeableFamily = (filter: EditableFilter): boolean =>
    !!familyByStatId.get(filter.statId)?.interchangeable;
  const interchangeableF = filters.filter(
    (f) =>
      (f.group === "and" || f.group === "count") &&
      !inFracCount(f) &&
      inInterchangeableFamily(f),
  );
  const andF = filters.filter(
    (f) => f.group === "and" && !inFracCount(f) && !inInterchangeableFamily(f),
  );
  const countF = filters.filter(
    (f) => f.group === "count" && !inFracCount(f) && !inInterchangeableFamily(f),
  );
  const notF = filters.filter((f) => f.group === "not" && !inFracCount(f));
  const activeFamilyIds = new Set([...andF, ...countF].map((filter) => filter.statId));
  const disabledFamilySiblings = (present: EditableFilter[]): TradeStatFilter[] => {
    const siblingIds = new Set<string>();
    for (const filter of present) {
      const family = familyByStatId.get(filter.statId);
      if (!family) continue;
      for (const id of family.memberIds) {
        if (!activeFamilyIds.has(id)) siblingIds.add(id);
      }
    }
    return [...siblingIds].map((id) => ({ id, disabled: true }));
  };

  /**
   * Optional mods, split into one pool per band.
   *
   * Two rules keep the split from quietly turning every search into an exact
   * match, both learned the hard way against the live API:
   *
   * A pool of one is not a quota, it is a requirement — and the lone mod is
   * usually an implicit, which on a real item is the *rarest* thing on it.
   * Ancient Skull's "+2 to Level of Socketed Gems" is a corrupted implicit
   * carried by 5 of the 4814 listed; giving it its own pool cut the search from
   * 4797 hits to 5. Single-mod bands therefore fold back into one shared pool
   * instead of each becoming mandatory.
   *
   * The threshold rounds rather than ceils, because ceiling a small pool
   * demands all of it — a 2-mod pool at the 0.6 "as-is" fraction would need
   * both — and splitting exists precisely to create small pools.
   */
  /**
   * Uniques are never split. Their mods are fixed rolls on the item, not
   * affixes — there is no prefix or suffix to separate — so the only division
   * left would be implicit vs the rest, and on a unique the implicit is
   * typically a corruption that almost no listing carries. Ancient Skull's
   * corrupted "+2 to Level of Socketed Gems" is on 5 of 4814 listed.
   */
  const splitBands = item.rarity !== "unique";
  const byBand = new Map<StatBand, EditableFilter[]>();
  for (const f of countF) {
    const key = splitBands ? f.band : "other";
    const list = byBand.get(key) ?? [];
    list.push(f);
    byBand.set(key, list);
  }
  const countByBand = new Map<StatBand, EditableFilter[]>();
  for (const [key, list] of byBand) {
    const target = list.length >= 2 ? key : "other";
    countByBand.set(target, [...(countByBand.get(target) ?? []), ...list]);
  }

  const bands: BandInfo[] = [];
  for (const key of BAND_ORDER) {
    const list = countByBand.get(key);
    if (!list || list.length === 0) continue;
    const fallback = Math.max(1, Math.round(list.length * BAND_FRACTION));
    const min = Math.min(Math.max(1, overrides?.bandMins?.[key] ?? fallback), list.length);
    bands.push({ key, label: BAND_LABEL[key], total: list.length, min });
  }

  const stats: TradeStatGroup[] = [];
  const strategyParts: string[] = [];

  if (andF.length > 0) {
    stats.push({ type: "and", filters: andF.map(toStatFilter) });
    strategyParts.push(`${andF.length} required`);
  }
  // Most Timeless Jewels transform the tree from the numeric seed; their
  // historical figure only selects the keystone. Search every figure with the
  // same exact seed in one count=1 group so equivalent seeds are not hidden.
  // Militant Faith deliberately does not opt into this family behavior.
  const interchangeableByFamily = new Map<string, EditableFilter[]>();
  for (const filter of interchangeableF) {
    const family = familyByStatId.get(filter.statId)!;
    const list = interchangeableByFamily.get(family.key) ?? [];
    list.push(filter);
    interchangeableByFamily.set(family.key, list);
  }
  for (const list of interchangeableByFamily.values()) {
    const source = list[0];
    const family = familyByStatId.get(source.statId)!;
    stats.push({
      type: "count",
      value: { min: 1 },
      filters: family.memberIds.map((statId) =>
        toStatFilter({
          ...source,
          statId,
          fractured: false,
          fracturedStatId: null,
        }),
      ),
    });
    strategyParts.push(
      `${family.label}: exact seed ${source.currentRoll ?? ""} · any variant`.trim(),
    );
  }
  for (const band of bands) {
    const list = countByBand.get(band.key)!;
    const siblings = disabledFamilySiblings(list);
    // min === total is "all of them", which reads better as a required group
    // unless disabled family alternatives are present. In that case `count`
    // lets the user enable a sibling as an alternative on the trade site.
    if (band.min >= list.length && siblings.length === 0) {
      stats.push({ type: "and", filters: list.map(toStatFilter) });
      strategyParts.push(
        list.length === 1 ? "1 required" : `all ${list.length} ${band.label.toLowerCase()}`,
      );
    } else {
      stats.push({
        type: "count",
        value: { min: band.min },
        filters: [...list.map(toStatFilter), ...siblings],
      });
      strategyParts.push(`any ${band.min} of ${list.length} ${band.label.toLowerCase()}`);
    }
  }
  if (notF.length > 0) {
    stats.push({ type: "not", filters: notF.map(toStatFilter) });
    strategyParts.push(`${notF.length} excluded`);
  }
  if (useFracCount) {
    stats.push({ type: "count", value: { min: 1 }, filters: fracMulti.map(toStatFilter) });
    strategyParts.push(`any 1 of ${fracMulti.length} fractured`);
  }
  // Buy-out → "Instant Buyout": status `securable` (supported by both PoE1 & PoE2
  // trade after async trading). Otherwise "In Person (Online)".
  const buyout = overrides?.buyout ?? true;
  const statusOption = buyout ? "securable" : "online";
  const query: TradeQuery = { status: { option: statusOption }, stats, filters: {} };
  if (item.category === "gem") {
    const g = overrides?.gem;
    const level = g ? g.level : item.gemLevel ?? null;
    const quality = g ? g.quality : item.quality ?? null;
    const sockets = g ? g.sockets : null;
    const gemFilters: Record<string, unknown> = {};

    // PoB names gems after the granted effect ("Multistrike", "Cyclone of
    // Tumult"); the trade base type is often different or needs a variant
    // discriminator, so always go through the resolver.
    const gemType = resolveGemType(game, item.name);
    if (gemType) {
      query.type = gemType.discriminator
        ? { option: gemType.type, discriminator: gemType.discriminator }
        : gemType.type;
      if (level !== null) gemFilters.gem_level = { min: level };
      if (quality !== null) gemFilters.quality = { min: quality };
      if (sockets !== null) gemFilters.gem_sockets = { min: sockets };
    } else if (game === "poe2") {
      // PoE2 sells uncut gems that the player carves into a skill, so an
      // unlisted name is bought as its uncut base rather than not at all.
      query.type = /\bsupport\b/i.test(item.name) ? "Uncut Support Gem" : "Uncut Skill Gem";
      if (level !== null) gemFilters.gem_level = { min: level };
    } else {
      // Unknown PoE1 gem (data snapshot older than the league): sending the raw
      // name would 400 with "Unknown item base type". Degrade to the gem
      // category so the link still opens on a usable search.
      // "Any Gem", not a skill/support guess: PoB drops the " Support" suffix,
      // so the name gives us nothing to tell the two apart.
      query.filters.type_filters = { filters: { category: { option: "gem" } } };
      if (level !== null) gemFilters.gem_level = { min: level };
      if (quality !== null) gemFilters.quality = { min: quality };
    }
    query.filters.misc_filters = { filters: gemFilters };
  } else if (item.rarity === "unique") {
    // PoB prepends "Foulborn " to a mutated unique's title (Item.lua) and
    // strips it back off whenever it needs the real name — trade only knows the
    // real one, and sending the prefixed title is a 400 "Unknown item name".
    query.name = item.name.replace(/^foulborn\s+/i, "");
    strategyParts.push("unique name");
    if (baseScope === "exact") query.type = tradeBaseType(item.baseType);
    query.filters.type_filters = { filters: { rarity: { option: "unique" } } };
  } else if (item.category === "flask" || item.category === "charm") {
    if (baseScope === "exact") query.type = consumableBase(item.baseType);
  } else if (baseScope === "exact") {
    query.type = tradeBaseType(item.baseType);
  }

  // Vestigial is an official misc filter, independent of the base and rarity.
  // Without it, a unique-name search mixes ordinary, synthesised and Vestigial
  // copies and can return a completely different implicit.
  if (game === "poe1" && item.vestigial) {
    const miscFilters = query.filters.misc_filters ?? { filters: {} };
    miscFilters.filters.vestigial = { option: "true" };
    query.filters.misc_filters = miscFilters;
    strategyParts.push("Vestigial");
  }

  if (baseScope === "slot") {
    const category = tradeCategory(game, item);
    if (category) {
      const typeFilters = query.filters.type_filters ?? { filters: {} };
      typeFilters.filters.category = { option: category };
      query.filters.type_filters = typeFilters;
      strategyParts.push("same slot/class");
    }
  } else if (baseScope === "exact" && item.rarity !== "unique") {
    strategyParts.push("exact base");
  }

  // Equipment filters: armour defences + weapon DPS, routed to the right group.
  const armourKey = getGame(game).equipmentFilterKey;
  const weaponKey = getGame(game).weaponFilterKey;
  const byKey: Record<string, Record<string, { min?: number; max?: number }>> = {};
  let hasArmour = false;
  let hasWeapon = false;
  for (const e of equipment) {
    if (!e.include) continue;
    const value: { min?: number; max?: number } = {};
    if (e.min !== null && e.min !== undefined) value.min = e.min;
    if (e.max !== null && e.max !== undefined) value.max = e.max;
    if (value.min === undefined && value.max === undefined) continue;
    const key = e.group === "weapon" ? weaponKey : armourKey;
    (byKey[key] ??= {})[e.field] = value;
    if (e.group === "weapon") hasWeapon = true;
    else hasArmour = true;
  }
  for (const [key, fields] of Object.entries(byKey)) {
    query.filters[key] = { filters: { ...(query.filters[key]?.filters ?? {}), ...fields } };
  }
  if (hasArmour) strategyParts.push("defences");
  if (hasWeapon) strategyParts.push("DPS");

  // Socket constraints are opt-in. The original socket string is surfaced in
  // the dialog, but buying an unlinked base is usually cheaper.
  if (game === "poe1" && (socket.links !== null || socket.sockets !== null)) {
    const socketFilters: Record<string, { min: number }> = {};
    if (socket.links !== null) socketFilters.links = { min: socket.links };
    if (socket.sockets !== null) socketFilters.sockets = { min: socket.sockets };
    query.filters.socket_filters = { filters: socketFilters };
    strategyParts.push(
      [socket.links !== null ? `${socket.links}L` : "", socket.sockets !== null ? `${socket.sockets}S` : ""]
        .filter(Boolean)
        .join("/"),
    );
  }
  if (game === "poe2" && socket.runeSockets !== null) {
    const key = getGame(game).equipmentFilterKey;
    const current = query.filters[key] ?? { filters: {} };
    current.filters.rune_sockets = { min: socket.runeSockets };
    query.filters[key] = current;
    strategyParts.push(`${socket.runeSockets} augment sockets`);
  }

  // Pseudo totals replace their raw source filters above rather than stacking
  // on top of them. They remain default-off and explicitly user-selected.
  const pseudoStatFilters: TradeStatFilter[] = [];
  for (const p of pseudo) {
    if (!p.include) continue;
    const value: { min?: number; max?: number } = {};
    if (p.min !== null && p.min !== undefined) value.min = p.min;
    if (p.max !== null && p.max !== undefined) value.max = p.max;
    const filter: TradeStatFilter = { id: p.statId };
    if (value.min !== undefined || value.max !== undefined) filter.value = value;
    pseudoStatFilters.push(filter);
  }
  if (pseudoStatFilters.length > 0) {
    stats.push({ type: "and", filters: pseudoStatFilters });
    strategyParts.push(`${pseudoStatFilters.length} total${pseudoStatFilters.length === 1 ? "" : "s"}`);
  }

  // Influence is a means to roll a mod, not part of the replacement item's
  // identity. The matched stat itself is enough; requiring the original
  // influence narrows equivalent/cheaper results for no benefit.

  // (Buy-out is handled by status `securable` above for both games.)

  // The trade site rejects an empty `stats` array ("search is no longer valid").
  // Always include at least one (empty) group, like the official site does.
  if (query.stats.length === 0) {
    query.stats.push({ type: "and", filters: [] });
  }

  return {
    query,
    matched: filters.length,
    unmatched,
    bands,
    filters,
    equipment,
    pseudo,
    baseScope,
    socket,
    strategy: strategyParts.join(" · ") || (baseScope === "exact" ? "base type only" : "any item"),
  };
}
