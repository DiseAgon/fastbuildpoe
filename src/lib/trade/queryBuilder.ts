import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import { getStatIndex, matchMod } from "./statIndex";
import { computePseudoFilters } from "./pseudo";
import { getWeaponBase } from "./weaponBase";
import { computeWeaponDps } from "./weaponDps";

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
}

export interface TradeStatFilter {
  id: string;
  value?: { min?: number; max?: number };
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

function flaskBase(baseType: string): string {
  const match = baseType.match(/^(.*?\bflask)\b/i);
  return match ? match[1] : baseType;
}

async function autoFilters(
  game: GameId,
  item: ParsedItem,
  mode: BudgetMode,
): Promise<{ filters: EditableFilter[]; unmatched: number }> {
  const cfg = MODE_CONFIG[mode];
  const index = await getStatIndex(game);

  const filters: EditableFilter[] = [];
  let unmatched = 0;
  for (const mod of item.mods) {
    const hit = matchMod(index, mod);
    if (!hit) {
      unmatched++;
      continue;
    }
    filters.push({
      statId: hit.entry.id,
      text: mod.text,
      currentRoll: mod.values[0] ?? null,
      min: hit.negated ? null : bandedMin(mod.values[0], cfg.factor),
      max: null,
      group: cfg.group,
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
  const filter: TradeStatFilter = { id: f.statId };
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

  const andF = filters.filter((f) => f.group === "and");
  const countF = filters.filter((f) => f.group === "count");
  const notF = filters.filter((f) => f.group === "not");

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

  // Buy-out → "Instant Buyout": status `securable` (supported by both PoE1 & PoE2
  // trade after async trading). Otherwise "In Person (Online)".
  const buyout = overrides?.buyout ?? true;
  const statusOption = buyout ? "securable" : "online";
  const query: TradeQuery = { status: { option: statusOption }, stats, filters: {} };
  const useBase = overrides?.useBase ?? true;

  if (item.category === "gem") {
    query.type = item.name;
    const gemFilters: Record<string, unknown> = {};
    if (mode !== "budget") {
      if (item.gemLevel) gemFilters.gem_level = { min: item.gemLevel };
      if (item.quality) gemFilters.quality = { min: item.quality };
    }
    query.filters.misc_filters = { filters: gemFilters };
  } else if (item.rarity === "unique") {
    query.name = item.name;
    if (useBase) query.type = item.baseType;
    query.filters.type_filters = { filters: { rarity: { option: "unique" } } };
  } else if (item.category === "flask") {
    if (useBase) query.type = flaskBase(item.baseType);
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
