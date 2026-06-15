import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import { getStatIndex, matchMod, normalizeStatText, type StatIndex } from "./statIndex";
import { computePseudoFilters } from "./pseudo";
import { MOD_FAMILIES } from "./groups";
import { getWeaponBase } from "./weaponBase";
import { computeWeaponDps } from "./weaponDps";
import { isValidGemType } from "./gemTypes";

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
  countMin?: number;
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
  value?: { min?: number; max?: number };
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
      const entry = index.byText.get(normalizeStatText(text))?.find((e) => e.type === "explicit");
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

export interface TradeQuery {
  status: { option: string };
  name?: string;
  type?: string;
  stats: TradeStatGroup[];
  filters: Record<string, { filters: Record<string, unknown> }>;
}

export interface BuiltQuery {
  query: TradeQuery;
  matched: number;
  unmatched: number;
  countMin: number;
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

async function autoFilters(
  game: GameId,
  item: ParsedItem,
  mode: BudgetMode,
): Promise<{ filters: EditableFilter[]; unmatched: number }> {
  const cfg = MODE_CONFIG[mode];
  const index = await getStatIndex(game);
  const families = resolveFamilies(index);

  const filters: EditableFilter[] = [];
  let unmatched = 0;
  for (const mod of item.mods) {
    const hit = matchMod(index, mod);
    if (!hit) {
      unmatched++;
      continue;
    }
    const fracturedEntry = index.byText
      .get(normalizeStatText(mod.template))
      ?.find((e) => e.type === "fractured");
    // Exact-match families (timeless jewel seeds) lock min = max = roll.
    const exact = families.get(hit.entry.id)?.exact ?? false;
    const roll = mod.values[0];
    filters.push({
      statId: hit.entry.id,
      text: mod.text,
      currentRoll: roll ?? null,
      min: exact ? (roll ?? null) : hit.negated ? null : bandedMin(roll, cfg.factor),
      max: exact ? (roll ?? null) : null,
      group: cfg.group,
      // Default off: search the mod normally (matches fractured or not). The
      // Frac toggle stays available for users who specifically want fractured.
      fractured: false,
      fracturedStatId: fracturedEntry?.id ?? null,
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

  const defaultCount = Math.max(1, Math.ceil(countF.length * cfg.fraction));
  const countMin = Math.min(overrides?.countMin ?? defaultCount, countF.length || 1);

  const stats: TradeStatGroup[] = [];
  const strategyParts: string[] = [];

  if (andF.length > 0) {
    stats.push({ type: "and", filters: andF.map(toStatFilter) });
    strategyParts.push(`${andF.length} required`);
  }
  if (countF.length >= 2) {
    stats.push({ type: "count", value: { min: countMin }, filters: countF.map(toStatFilter) });
    strategyParts.push(`any ${countMin} of ${countF.length}`);
  } else if (countF.length === 1) {
    // A lone "optional" mod is just required.
    stats.push({ type: "and", filters: countF.map(toStatFilter) });
    strategyParts.push(`1 required`);
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

    if (isValidGemType(game, item.name)) {
      query.type = item.name;
      if (level !== null) gemFilters.gem_level = { min: level };
      if (quality !== null) gemFilters.quality = { min: quality };
      if (sockets !== null) gemFilters.gem_sockets = { min: sockets };
    } else if (game === "poe2") {
      // PoE2 trades these as Uncut gems (skill names like "Grace"/supports
      // aren't valid types). Fall back to the uncut gem so the link is valid.
      query.type = /\bsupport\b/i.test(item.name) ? "Uncut Support Gem" : "Uncut Skill Gem";
      if (level !== null) gemFilters.gem_level = { min: level };
    } else {
      query.type = item.name; // PoE1 gems are valid types — best effort
      if (level !== null) gemFilters.gem_level = { min: level };
      if (quality !== null) gemFilters.quality = { min: quality };
    }
    query.filters.misc_filters = { filters: gemFilters };
  } else if (item.rarity === "unique") {
    query.name = item.name;
    if (useBase) query.type = item.baseType;
    query.filters.type_filters = { filters: { rarity: { option: "unique" } } };
  } else if (item.category === "flask" || item.category === "charm") {
    if (useBase) query.type = consumableBase(item.baseType);
  } else if (useBase) {
    query.type = item.baseType;
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
    countMin,
    filters,
    equipment,
    pseudo,
    useBase,
    strategy: strategyParts.join(" · ") || (useBase ? "base type only" : "any item"),
  };
}
