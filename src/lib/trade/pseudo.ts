import type { PseudoFilter } from "./queryBuilder";

/**
 * Pseudo "total" stats (verified present in both PoE1 and PoE2 data/stats).
 * These let an item match by aggregate value however the rolls are split —
 * e.g. "total Elemental Resistance" across fire/cold/lightning sources.
 */
export const PSEUDO_IDS = {
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

type Contribution = Partial<Buckets>;

/**
 * Source trade stats and the totals they contribute to.
 *
 * Keys deliberately omit the `explicit.` / `implicit.` / `crafted.` /
 * `fractured.` prefix: the trade API gives the same underlying stat a
 * different prefix depending on how it appears on the item. Unlike matching
 * English mod text, these ids are stable across wording and localisation
 * changes in PoB and the trade site.
 */
const SOURCE_CONTRIBUTIONS: Record<string, Contribution> = {
  stat_3372524247: { fire: 1 },
  stat_4220027924: { cold: 1 },
  stat_1671376347: { lightning: 1 },
  stat_2923486259: { chaos: 1 },
  stat_2901986750: { fire: 1, cold: 1, lightning: 1 },
  stat_2016723660: { fire: 1, cold: 1, lightning: 1, chaos: 1 }, // PoE1 all res
  stat_3128852541: { fire: 1, cold: 1, lightning: 1, chaos: 1 }, // PoE2 all res
  stat_2915988346: { fire: 1, cold: 1 },
  stat_3441501978: { fire: 1, lightning: 1 },
  stat_4277795662: { cold: 1, lightning: 1 },
  stat_378817135: { fire: 1, chaos: 1 },
  stat_3393628375: { cold: 1, chaos: 1 },
  stat_3465022881: { lightning: 1, chaos: 1 },

  stat_4080418644: { str: 1 },
  stat_3261801346: { dex: 1 },
  stat_328541901: { int: 1 },
  stat_1379411836: { str: 1, dex: 1, int: 1 },
  stat_2897413282: { str: 1, dex: 1, int: 1 }, // PoE2 alternate all attributes
  stat_538848803: { str: 1, dex: 1 },
  stat_1535626285: { str: 1, int: 1 },
  stat_2543977012: { str: 1, int: 1 }, // PoE1 alternate Str/Int
  stat_2300185227: { dex: 1, int: 1 },

  stat_3299347043: { life: 1 },
  stat_1050105434: { mana: 1 },
  stat_3489782002: { es: 1 },
  stat_4052037485: { es: 1 }, // local flat ES on armour
};

const sourceKey = (statId: string): string => statId.replace(/^[^.]+\./, "");

const PSEUDO_BUCKETS: Record<string, Array<keyof Buckets>> = {
  [PSEUDO_IDS.fire]: ["fire"],
  [PSEUDO_IDS.cold]: ["cold"],
  [PSEUDO_IDS.lightning]: ["lightning"],
  [PSEUDO_IDS.chaos]: ["chaos"],
  [PSEUDO_IDS.elemental]: ["fire", "cold", "lightning"],
  [PSEUDO_IDS.resistance]: ["fire", "cold", "lightning", "chaos"],
  [PSEUDO_IDS.str]: ["str"],
  [PSEUDO_IDS.dex]: ["dex"],
  [PSEUDO_IDS.int]: ["int"],
  [PSEUDO_IDS.life]: ["life"],
  [PSEUDO_IDS.es]: ["es"],
  [PSEUDO_IDS.mana]: ["mana"],
};

/** Resistance totals overlap each other, so only one should be active at once. */
export type PseudoFamily = "resistance";

/**
 * Whether a raw mod is already represented by a selected pseudo total.
 * The query builder uses this as a safety net and the client uses the same
 * rule to visibly switch the source rows off when the user chooses “Replace”.
 */
export function pseudoCoversFilter(pseudoStatId: string, sourceStatId: string): boolean {
  const contribution = SOURCE_CONTRIBUTIONS[sourceKey(sourceStatId)];
  const buckets = PSEUDO_BUCKETS[pseudoStatId];
  return !!contribution && !!buckets?.some((bucket) => contribution[bucket]);
}

function accumulate(filters: Array<{ statId: string; currentRoll: number | null }>): Buckets {
  const b: Buckets = { fire: 0, cold: 0, lightning: 0, chaos: 0, str: 0, dex: 0, int: 0, life: 0, es: 0, mana: 0 };
  for (const filter of filters) {
    const v = filter.currentRoll ?? 0;
    if (v === 0) continue;
    const contribution = SOURCE_CONTRIBUTIONS[sourceKey(filter.statId)];
    if (!contribution) continue;
    for (const [bucket, multiplier] of Object.entries(contribution) as Array<
      [keyof Buckets, number]
    >) {
      b[bucket] += v * multiplier;
    }
  }
  return b;
}

/** Build default-off pseudo totals from the item's matched trade-stat ids. */
export function computePseudoFilters(
  filters: Array<{ statId: string; currentRoll: number | null }>,
  factor: number,
): PseudoFilter[] {
  const b = accumulate(filters);
  const band = (n: number) => Math.max(1, Math.floor(n * factor));
  const out: PseudoFilter[] = [];
  const add = (statId: string, label: string, value: number, family?: PseudoFamily) => {
    if (value > 0) {
      out.push({ statId, label, itemValue: value, min: band(value), max: null, include: false, family });
    }
  };

  const elemental = b.fire + b.cold + b.lightning;
  add(PSEUDO_IDS.elemental, "Total Elemental Res", elemental, "resistance");
  if (b.chaos > 0) add(PSEUDO_IDS.resistance, "Total Res (incl. Chaos)", elemental + b.chaos, "resistance");
  add(PSEUDO_IDS.fire, "Total Fire Res", b.fire, "resistance");
  add(PSEUDO_IDS.cold, "Total Cold Res", b.cold, "resistance");
  add(PSEUDO_IDS.lightning, "Total Lightning Res", b.lightning, "resistance");
  add(PSEUDO_IDS.chaos, "Total Chaos Res", b.chaos, "resistance");
  add(PSEUDO_IDS.str, "Total Strength", b.str);
  add(PSEUDO_IDS.dex, "Total Dexterity", b.dex);
  add(PSEUDO_IDS.int, "Total Intelligence", b.int);
  add(PSEUDO_IDS.life, "Total Life", b.life);
  add(PSEUDO_IDS.es, "Total Energy Shield", b.es);
  add(PSEUDO_IDS.mana, "Total Mana", b.mana);

  return out;
}
