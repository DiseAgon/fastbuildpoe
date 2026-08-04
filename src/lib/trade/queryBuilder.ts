import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import { getStatIndex, matchMod, normalizeStatText, type StatIndex } from "./statIndex";
import { computePseudoFilters } from "./pseudo";
import { MOD_FAMILIES } from "./groups";
import { getWeaponBase } from "./weaponBase";
import { computeWeaponDps } from "./weaponDps";
import { resolveGemType } from "./gemTypes";

/**
 * Budget axis (see SPEC §7) — seeds sensible defaults the user can then tweak
 * per mod in the UI.
 *  - minmax: every mod Required (AND) at the item's rolls.
 *  - asis:   match MOST mods (count group) at ~70% rolls (default).
 *  - budget: match fewer mods at ~50% rolls, uncorrupted.
 */
export type BudgetMode = "minmax" | "asis" | "budget";

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

interface ModeConfig {
  factor: number;
  /** Default group for matched mods. */
  group: Extract<FilterGroup, "and" | "count">;
  /** When using a count group, fraction of mods that must match. */
  fraction: number;
}

const MODE_CONFIG: Record<BudgetMode, ModeConfig> = {
  minmax: { factor: 1.0, group: "and", fraction: 1 },
  asis: { factor: 0.7, group: "count", fraction: 0.6 },
  budget: { factor: 0.5, group: "count", fraction: 0.4 },
};

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
}

export interface QueryOverrides {
  /** Per-band thresholds, keyed by band. Absent bands keep their default. */
  bandMins?: Partial<Record<StatBand, number>>;
  filters?: EditableFilter[];
  equipment?: EquipmentFilter[];
  pseudo?: PseudoFilter[];
  /** Restrict to listings with a fixed buyout price (default true). */
  buyout?: boolean;
  /** Constrain to the item's base type (default true). */
  useBase?: boolean;
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
    const info: FamilyInfo = { key: fam.key, label: fam.label, memberIds, exact: !!fam.exact };
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
  useBase: boolean;
  strategy: string;
}

function bandedMin(value: number | undefined, factor: number): number | null {
  if (value === undefined || value <= 0) return null;
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
  mode: BudgetMode,
): Promise<{ filters: EditableFilter[]; unmatched: number }> {
  const cfg = MODE_CONFIG[mode];
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
  for (const mod of item.mods) {
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
    // Exact-match families (timeless jewel seeds) lock min = max = roll.
    const exact = families.get(hit.entry.id)?.exact ?? false;
    const roll = mod.values[0];
    const isOption = hit.option !== undefined;
    // "reduced X" matches the "increased X" stat with negative values on the
    // trade side, so "at least this much reduction" is a max, not a min.
    const negatedMax =
      hit.negated && roll !== undefined && roll > 0
        ? -Math.max(1, Math.floor(roll * cfg.factor))
        : null;
    filters.push({
      statId: hit.entry.id,
      text: mod.text,
      currentRoll: isOption ? null : (roll ?? null),
      min: isOption ? null : exact ? (roll ?? null) : hit.negated ? null : bandedMin(roll, cfg.factor),
      max: isOption ? null : exact ? (roll ?? null) : negatedMax,
      group: cfg.group,
      // Default off: search the mod normally (matches fractured or not). The
      // Frac toggle stays available for users who specifically want fractured.
      fractured: false,
      fracturedStatId: fracturedEntry?.id ?? null,
      option: hit.option ?? null,
      band: bandOf(mod),
    });
  }
  return { filters, unmatched };
}

const band = (value: number, factor: number) => Math.max(1, Math.floor(value * factor));

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
      const decBand = (v: number) => Math.round(v * factor * 10) / 10;
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
  mode: BudgetMode,
  overrides?: QueryOverrides,
): Promise<BuiltQuery> {
  const cfg = MODE_CONFIG[mode];

  let filters: EditableFilter[];
  let unmatched: number;
  if (overrides?.filters) {
    filters = overrides.filters;
    unmatched = 0;
  } else {
    const auto = await autoFilters(game, item, mode);
    filters = auto.filters;
    unmatched = auto.unmatched;
  }

  // An item has only one fractured mod, so AND-ing several fractured choices
  // finds nothing. When the user marks 2+ as fractured, collapse them into a
  // "any 1 of these fractured" count group instead (more variable matching).
  const fracMulti = filters.filter(
    (f) => f.group !== "off" && f.fractured && f.fracturedStatId,
  );
  const useFracCount = fracMulti.length >= 2;
  const inFracCount = (f: EditableFilter) => useFracCount && f.fractured && !!f.fracturedStatId;

  // Family grouping: pull same-kind mods (resistances, attributes, added dmg,
  // etc.) into a count group that also carries their disabled siblings.
  const familyByStatId = resolveFamilies(await getStatIndex(game));
  const inFamily = new Set<EditableFilter>();
  const presentByFamily = new Map<string, EditableFilter[]>();
  for (const f of filters) {
    if (f.group !== "and" && f.group !== "count") continue;
    if (inFracCount(f) || f.fractured) continue;
    const fam = familyByStatId.get(f.statId);
    if (!fam) continue;
    const list = presentByFamily.get(fam.key) ?? [];
    list.push(f);
    presentByFamily.set(fam.key, list);
    inFamily.add(f);
  }

  const andF = filters.filter((f) => f.group === "and" && !inFracCount(f) && !inFamily.has(f));
  const countF = filters.filter((f) => f.group === "count" && !inFracCount(f) && !inFamily.has(f));
  const notF = filters.filter((f) => f.group === "not" && !inFracCount(f));

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
    const fallback = Math.max(1, Math.round(list.length * cfg.fraction));
    const min = Math.min(Math.max(1, overrides?.bandMins?.[key] ?? fallback), list.length);
    bands.push({ key, label: BAND_LABEL[key], total: list.length, min });
  }

  const stats: TradeStatGroup[] = [];
  const strategyParts: string[] = [];

  if (andF.length > 0) {
    stats.push({ type: "and", filters: andF.map(toStatFilter) });
    strategyParts.push(`${andF.length} required`);
  }
  for (const band of bands) {
    const list = countByBand.get(band.key)!;
    // min === total is "all of them", which reads better as a required group
    // and spares the trade site a count group that can never be partly met.
    if (band.min >= list.length) {
      stats.push({ type: "and", filters: list.map(toStatFilter) });
      strategyParts.push(
        list.length === 1 ? "1 required" : `all ${list.length} ${band.label.toLowerCase()}`,
      );
    } else {
      stats.push({ type: "count", value: { min: band.min }, filters: list.map(toStatFilter) });
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
  // Family count groups: present members enabled, siblings added disabled.
  for (const [, present] of presentByFamily) {
    const fam = familyByStatId.get(present[0].statId)!;
    const presentIds = new Set(present.map((p) => p.statId));
    const siblings = fam.memberIds
      .filter((id) => !presentIds.has(id))
      .map((id) => ({ id, disabled: true }));
    stats.push({
      type: "count",
      value: { min: present.length },
      filters: [...present.map(toStatFilter), ...siblings],
    });
    strategyParts.push(`${fam.label} (${present.length})`);
  }

  // Buy-out → "Instant Buyout": status `securable` (supported by both PoE1 & PoE2
  // trade after async trading). Otherwise "In Person (Online)".
  const buyout = overrides?.buyout ?? true;
  const statusOption = buyout ? "securable" : "online";
  const query: TradeQuery = { status: { option: statusOption }, stats, filters: {} };
  const useBase = overrides?.useBase ?? true;

  if (item.category === "gem") {
    const g = overrides?.gem;
    const level = g ? g.level : mode !== "budget" ? item.gemLevel ?? null : null;
    const quality = g ? g.quality : mode !== "budget" ? item.quality ?? null : null;
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
    if (useBase) query.type = tradeBaseType(item.baseType);
    query.filters.type_filters = { filters: { rarity: { option: "unique" } } };
  } else if (item.category === "flask" || item.category === "charm") {
    if (useBase) query.type = consumableBase(item.baseType);
  } else if (useBase) {
    query.type = tradeBaseType(item.baseType);
  }

  // Equipment filters: armour defences + weapon DPS, routed to the right group.
  const equipment = overrides?.equipment ?? (await autoComputed(game, item, cfg.factor));
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

  // Pseudo "total" aggregate filters (off by default; user opts in).
  const pseudo = overrides?.pseudo ?? computePseudoFilters(item.mods, cfg.factor);
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

  // Influence flags (Shaper/Elder/… items): required for rares searched by
  // their influenced mods; harmless identity constraint otherwise.
  const INFLUENCE_KEYS: Record<string, string> = {
    Shaper: "shaper_item",
    Elder: "elder_item",
    Crusader: "crusader_item",
    Hunter: "hunter_item",
    Redeemer: "redeemer_item",
    Warlord: "warlord_item",
    "Searing Exarch": "searing_item",
    "Eater of Worlds": "tangled_item",
  };
  if (item.influences && item.influences.length > 0 && item.rarity !== "unique") {
    const misc = query.filters.misc_filters ?? { filters: {} };
    for (const inf of item.influences) {
      const key = INFLUENCE_KEYS[inf];
      if (key) misc.filters[key] = { option: true };
    }
    query.filters.misc_filters = misc;
    strategyParts.push(item.influences.join("+"));
  }

  if (mode === "budget") {
    const misc = query.filters.misc_filters ?? { filters: {} };
    misc.filters.corrupted = { option: false };
    query.filters.misc_filters = misc;
  }

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
    useBase,
    strategy: strategyParts.join(" · ") || (useBase ? "base type only" : "any item"),
  };
}
