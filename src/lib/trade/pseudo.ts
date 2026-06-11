import type { ParsedMod } from "@/types/item";
import type { PseudoFilter } from "./queryBuilder";

/**
 * Pseudo "total" stats (verified present in both PoE1 and PoE2 data/stats).
 * These let an item match by aggregate value however the rolls are split —
 * e.g. "total Elemental Resistance" across fire/cold/lightning sources.
 */
const PSEUDO_IDS = {
  fire: "pseudo.pseudo_total_fire_resistance",
  cold: "pseudo.pseudo_total_cold_resistance",
  lightning: "pseudo.pseudo_total_lightning_resistance",
  chaos: "pseudo.pseudo_total_chaos_resistance",
  elemental: "pseudo.pseudo_total_elemental_resistance",
  resistance: "pseudo.pseudo_total_resistance",
  str: "pseudo.pseudo_total_strength",
  dex: "pseudo.pseudo_total_dexterity",
  int: "pseudo.pseudo_total_intelligence",
  life: "pseudo.pseudo_total_life",
  es: "pseudo.pseudo_total_energy_shield",
  mana: "pseudo.pseudo_total_mana",
} as const;

interface Buckets {
  fire: number;
  cold: number;
  lightning: number;
  chaos: number;
  str: number;
  dex: number;
  int: number;
  life: number;
  es: number;
  mana: number;
}

function accumulate(mods: ParsedMod[]): Buckets {
  const b: Buckets = { fire: 0, cold: 0, lightning: 0, chaos: 0, str: 0, dex: 0, int: 0, life: 0, es: 0, mana: 0 };
  for (const mod of mods) {
    const v = mod.values[0] ?? 0;
    if (v === 0) continue;
    const t = mod.text.toLowerCase();

    // Resistances (hybrids first).
    if (/to all elemental resistances/.test(t)) {
      b.fire += v; b.cold += v; b.lightning += v;
    } else if (/to all resistances/.test(t)) {
      b.fire += v; b.cold += v; b.lightning += v; b.chaos += v;
    } else if (/to fire and cold resistances/.test(t)) {
      b.fire += v; b.cold += v;
    } else if (/to fire and lightning resistances/.test(t)) {
      b.fire += v; b.lightning += v;
    } else if (/to cold and lightning resistances/.test(t)) {
      b.cold += v; b.lightning += v;
    } else if (/to fire resistance/.test(t)) {
      b.fire += v;
    } else if (/to cold resistance/.test(t)) {
      b.cold += v;
    } else if (/to lightning resistance/.test(t)) {
      b.lightning += v;
    } else if (/to chaos resistance/.test(t)) {
      b.chaos += v;
    }

    // Attributes (hybrids first).
    if (/to all attributes/.test(t)) {
      b.str += v; b.dex += v; b.int += v;
    } else if (/to strength and dexterity/.test(t)) {
      b.str += v; b.dex += v;
    } else if (/to strength and intelligence/.test(t)) {
      b.str += v; b.int += v;
    } else if (/to dexterity and intelligence/.test(t)) {
      b.dex += v; b.int += v;
    } else if (/to strength/.test(t)) {
      b.str += v;
    } else if (/to dexterity/.test(t)) {
      b.dex += v;
    } else if (/to intelligence/.test(t)) {
      b.int += v;
    }

    // Flat life / ES / mana ("to maximum X" excludes "% increased maximum X").
    if (/to maximum life/.test(t)) b.life += v;
    if (/to maximum energy shield/.test(t)) b.es += v;
    if (/to maximum mana/.test(t)) b.mana += v;
  }
  return b;
}

/** Build default-off pseudo total filters from an item's mods. */
export function computePseudoFilters(mods: ParsedMod[], factor: number): PseudoFilter[] {
  const b = accumulate(mods);
  const band = (n: number) => Math.max(1, Math.floor(n * factor));
  const out: PseudoFilter[] = [];
  const add = (statId: string, label: string, value: number) => {
    if (value > 0) out.push({ statId, label, itemValue: value, min: band(value), max: null, include: false });
  };

  const elemental = b.fire + b.cold + b.lightning;
  add(PSEUDO_IDS.elemental, "Total Elemental Res", elemental);
  if (b.chaos > 0) add(PSEUDO_IDS.resistance, "Total Res (incl. Chaos)", elemental + b.chaos);
  add(PSEUDO_IDS.fire, "Total Fire Res", b.fire);
  add(PSEUDO_IDS.cold, "Total Cold Res", b.cold);
  add(PSEUDO_IDS.lightning, "Total Lightning Res", b.lightning);
  add(PSEUDO_IDS.chaos, "Total Chaos Res", b.chaos);
  add(PSEUDO_IDS.str, "Total Strength", b.str);
  add(PSEUDO_IDS.dex, "Total Dexterity", b.dex);
  add(PSEUDO_IDS.int, "Total Intelligence", b.int);
  add(PSEUDO_IDS.life, "Total Life", b.life);
  add(PSEUDO_IDS.es, "Total Energy Shield", b.es);
  add(PSEUDO_IDS.mana, "Total Mana", b.mana);

  return out;
}
