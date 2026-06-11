import type { ParsedItem, ParsedMod } from "@/types/item";
import type { WeaponBase } from "./weaponBase";

export interface WeaponDps {
  pdps: number;
  edps: number;
  /** Total DPS (physical + elemental + chaos). */
  dps: number;
  aps: number;
  crit: number;
}

const avg = (lo: number, hi: number) => (lo + hi) / 2;

/** Sum the two values of an "Adds # to #" mod (min,max). */
function addedRange(mod: ParsedMod): [number, number] {
  const [lo = 0, hi = 0] = mod.values;
  return [lo, hi];
}

/**
 * Compute the weapon's pDPS / eDPS / total DPS the way the trade site does —
 * from the item's *local* properties only. Notably, "increased Elemental
 * Damage with Attacks" is GLOBAL and does NOT raise the weapon's listed eDPS,
 * so it is excluded; only local "Adds # to # <element> Damage" counts.
 */
export function computeWeaponDps(item: ParsedItem, base: WeaponBase): WeaponDps {
  let incPhys = item.quality ?? 0; // quality adds as % increased physical
  let incAttackSpeed = 0;
  let incCrit = 0;
  let addedPhysMin = 0;
  let addedPhysMax = 0;
  let eleAvg = 0;
  let chaosAvg = 0;

  for (const mod of item.mods) {
    const t = mod.text.toLowerCase();
    // Skip global "to Attacks"/"to Spells" variants (those aren't local weapon stats).
    const isGlobal = /to attacks|to spells|with attacks|with spells/.test(t);

    if (/increased physical damage/.test(t) && !isGlobal) {
      incPhys += mod.values[0] ?? 0;
    } else if (/increased attack speed/.test(t) && !isGlobal) {
      incAttackSpeed += mod.values[0] ?? 0;
    } else if (/increased critical/.test(t) && !isGlobal) {
      incCrit += mod.values[0] ?? 0;
    } else if (/adds # to # physical damage/.test(mod.template.toLowerCase()) && !isGlobal) {
      const [lo, hi] = addedRange(mod);
      addedPhysMin += lo;
      addedPhysMax += hi;
    } else if (/adds # to # (fire|cold|lightning) damage/.test(mod.template.toLowerCase()) && !isGlobal) {
      const [lo, hi] = addedRange(mod);
      eleAvg += avg(lo, hi);
    } else if (/adds # to # chaos damage/.test(mod.template.toLowerCase()) && !isGlobal) {
      const [lo, hi] = addedRange(mod);
      chaosAvg += avg(lo, hi);
    }
  }

  const physMin = (base.physMin + addedPhysMin) * (1 + incPhys / 100);
  const physMax = (base.physMax + addedPhysMax) * (1 + incPhys / 100);
  const aps = base.aps * (1 + incAttackSpeed / 100);

  const pdps = avg(physMin, physMax) * aps;
  const edps = eleAvg * aps;
  const cdps = chaosAvg * aps;
  const crit = base.crit * (1 + incCrit / 100);

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    pdps: round(pdps),
    edps: round(edps),
    dps: round(pdps + edps + cdps),
    aps: round(aps),
    crit: round(crit),
  };
}
