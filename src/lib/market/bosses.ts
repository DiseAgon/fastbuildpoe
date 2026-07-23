/**
 * Boss Profit board — cost to open each pinnacle fight vs live prices of its
 * notable drops, so early-league boss farmers can see what actually pays.
 *
 * Each boss is split into sections (Uber on top, Standard below) because the
 * two versions have different drop pools; the uber fight also drops the whole
 * standard pool, noted in the UI.
 *
 * Costs come from the in-game Currency Exchange (Fragment category) and the
 * trade-site Invitation category. Drops come from the unique-item overviews
 * plus SkillGem (Awakened gems) — all via poe.ninja.
 *
 * Access recipes and drop pools verified against the official 3.29-era state:
 * every classic uber is opened with 4 boss-specific fragments dropped in T17
 * maps (fragment system from the 3.24 rework, count later reduced 5 → 4); the
 * three Incarnation bosses (3.26) have harder versions via their Echo /
 * fragment items (3.27).
 */

import {
  getFlipBoard,
  stashLines,
  UNIQUE_TYPES,
  type FlipRow,
  type NinjaStashLine,
} from "./ninja";

interface CostItemDef {
  /** Currency Exchange line id (poe.ninja exchange Fragment category). */
  cxId?: string;
  /** Trade-site Invitation name (poe.ninja Invitation category). */
  invName?: string;
  label: string;
  qty: number;
}

interface DropDef {
  name: string;
  /** Alternate spellings seen in the wild (source typos, renames). */
  aliases?: string[];
}

interface SectionDef {
  label: string;
  cost: CostItemDef[];
  /** Shown when the entry item has no market feed (e.g. Cortex map). */
  costNote?: string;
  drops: DropDef[];
  note?: string;
}

interface BossDef {
  id: string;
  name: string;
  subtitle: string;
  sections: SectionDef[];
  note?: string;
}

const D = (name: string, aliases?: string[]): DropDef => ({ name, aliases });
const UBER_POOL_NOTE = "The uber fight also drops everything in the Standard pool below.";

const BOSSES: BossDef[] = [
  {
    id: "uber-maven",
    name: "The Maven",
    subtitle: "Uber: 4× Reality Fragment (T17 drops) · Standard: The Maven's Writ",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "reality-fragment", label: "Reality Fragment", qty: 4 }],
        drops: [
          D("Progenesis"),
          D("Impossible Escape"),
          D("Viridi's Veil"),
          D("Grace of the Goddess"),
          D("Awakened Empower Support"),
          D("Awakened Enlighten Support"),
          D("Awakened Enhance Support"),
        ],
        note: `${UBER_POOL_NOTE} Plus Shiny Reliquary Key / Curio of Potential.`,
      },
      {
        label: "Standard",
        cost: [{ cxId: "the-mavens-writ", label: "The Maven's Writ", qty: 1 }],
        drops: [
          D("Legacy of Fury"),
          D("Graven's Secret"),
          D("Arn's Anguish"),
          D("Olesya's Delight"),
          D("Doppelgänger Guise"),
          D("Echoforge"),
        ],
        note: "Also drops Orb of Conflict.",
      },
    ],
  },
  {
    id: "uber-sirus",
    name: "Sirus, Awakener of Worlds",
    subtitle: "Uber: 4× Awakening Fragment · Standard: the four Conqueror crests",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "awakening-fragment", label: "Awakening Fragment", qty: 4 }],
        drops: [D("The Saviour"), D("Oriath's End"), D("The Tempest Rising")],
        note: `${UBER_POOL_NOTE} Massive-ring Thread of Hope + Oubliette Reliquary Key are uber-only.`,
      },
      {
        label: "Standard",
        cost: [
          { cxId: "al-hezmins-crest", label: "Al-Hezmin's Crest", qty: 1 },
          { cxId: "barans-crest", label: "Baran's Crest", qty: 1 },
          { cxId: "droxs-crest", label: "Drox's Crest", qty: 1 },
          { cxId: "veritanias-crest", label: "Veritania's Crest", qty: 1 },
        ],
        drops: [
          D("Thread of Hope"),
          D("Crown of the Inward Eye"),
          D("Hands of the High Templar"),
          D("The Burden of Truth"),
        ],
        note: "Also drops Awakener's Orb / Orb of Dominance.",
      },
    ],
  },
  {
    id: "uber-exarch",
    name: "The Searing Exarch",
    subtitle: "Uber: 4× Blazing Fragment · Standard: Incandescent Invitation",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "blazing-fragment", label: "Blazing Fragment", qty: 4 }],
        drops: [
          D("Crystallised Omniscience"),
          D("The Annihilating Light"),
          D("Annihilation's Approach"),
          D("The Celestial Brace"),
        ],
        note: `${UBER_POOL_NOTE} Plus Archive Reliquary Key / Curio of Absorption.`,
      },
      {
        label: "Standard",
        cost: [{ invName: "Incandescent Invitation", label: "Incandescent Invitation", qty: 1 }],
        drops: [
          D("Dissolution of the Flesh"),
          D("Dawnbreaker"),
          D("Dawnstrider"),
          D("Forbidden Flame"),
        ],
        note: "Also drops Exceptional Eldritch Embers and Eldritch currency.",
      },
    ],
  },
  {
    id: "uber-eater",
    name: "The Eater of Worlds",
    subtitle: "Uber: 4× Devouring Fragment · Standard: Polaric Invitation",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "devouring-fragment", label: "Devouring Fragment", qty: 4 }],
        drops: [D("Nimis"), D("Ashes of the Stars"), D("Ravenous Passion")],
        note: `${UBER_POOL_NOTE} Plus Visceral Reliquary Key / Curio of Consumption.`,
      },
      {
        label: "Standard",
        cost: [{ invName: "Polaric Invitation", label: "Polaric Invitation", qty: 1 }],
        drops: [
          D("Melding of the Flesh"),
          D("The Gluttonous Tide"),
          D("Inextricable Fate"),
          D("Forbidden Flesh"),
        ],
        note: "Also drops Exceptional Eldritch Ichors and Eldritch currency.",
      },
    ],
  },
  {
    id: "uber-shaper",
    name: "The Shaper",
    subtitle: "Uber: 4× Cosmic Fragment · Standard: the four Shaper Guardian fragments",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "cosmic-fragment", label: "Cosmic Fragment", qty: 4 }],
        drops: [
          D("Sublime Vision"),
          D("Starforge"),
          D("Echoes of Creation"),
          D("Entropic Devastation"),
          D("The Tides of Time"),
        ],
        note: `${UBER_POOL_NOTE} Plus Cosmic Reliquary Key.`,
      },
      {
        label: "Standard",
        cost: [
          { cxId: "phoenix", label: "Fragment of the Phoenix", qty: 1 },
          { cxId: "chimer", label: "Fragment of the Chimera", qty: 1 },
          { cxId: "minot", label: "Fragment of the Minotaur", qty: 1 },
          { cxId: "hydra", label: "Fragment of the Hydra", qty: 1 },
        ],
        drops: [D("Dying Sun"), D("Solstice Vigil"), D("Shaper's Touch"), D("Voidwalker")],
        note: "Also drops Orb of Dominance and a guaranteed Fragment of Knowledge/Shape.",
      },
    ],
  },
  {
    id: "uber-uber-elder",
    name: "Uber Elder",
    subtitle: "Uber: 4× Decaying Fragment · Standard: Terror + Emptiness + Shape + Knowledge",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "decaying-fragment", label: "Decaying Fragment", qty: 4 }],
        drops: [
          D("Voidforge"),
          D("Sublime Vision"),
          D("The Eternity Shroud"),
          D("Soul Ascension"),
          D("Call of the Void"),
          D("The Devourer of Minds"),
        ],
        note: `${UBER_POOL_NOTE} Plus the 2-curse Impresence variant, Decaying Reliquary Key / Curio of Decay.`,
      },
      {
        label: "Standard",
        cost: [
          { cxId: "fragment-of-terror", label: "Fragment of Terror", qty: 1 },
          { cxId: "fragment-of-emptiness", label: "Fragment of Emptiness", qty: 1 },
          { cxId: "fragment-of-shape", label: "Fragment of Shape", qty: 1 },
          { cxId: "fragment-of-knowledge", label: "Fragment of Knowledge", qty: 1 },
        ],
        drops: [
          D("Watcher's Eye"),
          D("Indigon"),
          D("Disintegrator"),
          D("Voidfletcher"),
          D("Mark of the Elder"),
          D("Mark of the Shaper"),
        ],
        note: "Also drops Orb of Dominance.",
      },
    ],
  },
  {
    id: "uber-venarius",
    name: "Venarius (Cortex)",
    subtitle: "Uber: 4× Synthesising Fragment · Standard: Cortex unique map",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "synthesising-fragment", label: "Synthesising Fragment", qty: 4 }],
        drops: [],
        note: `${UBER_POOL_NOTE} No extra unique exclusives — adds 3 synthesised rares with rarer implicits.`,
      },
      {
        label: "Standard",
        cost: [],
        costNote: "Cortex unique map — drops in maps, not exchange-traded.",
        drops: [
          D("Rational Doctrine"),
          D("Bottled Faith"),
          D("Garb of the Ephemeral"),
          D("Offering to the Serpent"),
          D("Circle of Ambition"),
        ],
      },
    ],
  },
  {
    id: "incarnation-fear",
    name: "Incarnation of Fear",
    subtitle: "Uber: 4× Traumatic Fragment (lv85) · Echo of Trauma enters the fight directly",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "traumatic-fragment", label: "Traumatic Fragment", qty: 4 }],
        drops: [
          D("Starcaller"),
          D("Enmity's Embrace", ["Emnity's Embrace"]),
          D("Coiling Whisper"),
          D("Servant of Decay"),
        ],
        note: "Guaranteed one unique from the pool per kill (same pool on both routes).",
      },
      {
        label: "Echo — direct entry",
        cost: [{ cxId: "echo-of-trauma", label: "Echo of Trauma", qty: 1 }],
        drops: [],
      },
    ],
  },
  {
    id: "incarnation-neglect",
    name: "Incarnation of Neglect",
    subtitle: "Uber: 4× Lonely Fragment (lv85) · Echo of Loneliness enters the fight directly",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "lonely-fragment", label: "Lonely Fragment", qty: 4 }],
        drops: [
          D("Legacy of the Rose"),
          D("Venarius' Astrolabe"),
          D("Arkhon's Tools"),
          D("Betrayal's String"),
        ],
        note: "Guaranteed one unique from the pool per kill (same pool on both routes).",
      },
      {
        label: "Echo — direct entry",
        cost: [{ cxId: "echo-of-loneliness", label: "Echo of Loneliness", qty: 1 }],
        drops: [],
      },
    ],
  },
  {
    id: "incarnation-dread",
    name: "Incarnation of Dread",
    subtitle: "Uber: 4× Reverent Fragment (lv85) · Echo of Reverence enters the fight directly",
    sections: [
      {
        label: "Uber",
        cost: [{ cxId: "reverent-fragment", label: "Reverent Fragment", qty: 4 }],
        drops: [
          D("Wine of the Prophet"),
          D("Seven Teachings"),
          D("The Dark Monarch"),
          D("Whispers of Infinity"),
        ],
        note: "Guaranteed one unique from the pool per kill (same pool on both routes).",
      },
      {
        label: "Echo — direct entry",
        cost: [{ cxId: "echo-of-reverence", label: "Echo of Reverence", qty: 1 }],
        drops: [],
      },
    ],
  },
];

export interface PricedCostItem {
  label: string;
  qty: number;
  unitChaos: number | null;
  icon: string | null;
}

export interface BossDrop {
  name: string;
  chaos: number | null;
  icon: string | null;
  listings: number | null;
  trend7d: number | null;
  /** Number of price lines merged (unique variants); price shown is the max. */
  variants: number;
}

export interface BossSection {
  label: string;
  items: PricedCostItem[];
  /** Sum over the priced items only. */
  totalChaos: number;
  /** How many items had no price (total is a lower bound when > 0). */
  missing: number;
  costNote?: string;
  drops: BossDrop[];
  note?: string;
}

export interface BossCard {
  id: string;
  name: string;
  subtitle: string;
  sections: BossSection[];
  note?: string;
  /** First section's total — the uber entry cost. */
  uberCostChaos: number | null;
  topDropChaos: number | null;
}

export interface BossBoard {
  league: string;
  divinePrice: number | null;
  bosses: BossCard[];
  fetchedAt: number;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

interface UniqueAgg {
  chaos: number;
  icon: string | null;
  listings: number;
  trend7d: number | null;
  variants: number;
}

function indexUniques(lineSets: NinjaStashLine[][]): Map<string, UniqueAgg> {
  const map = new Map<string, UniqueAgg>();
  for (const lines of lineSets) {
    for (const line of lines) {
      if (!line.name || !line.chaosValue || line.chaosValue <= 0) continue;
      const key = norm(line.name);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          chaos: line.chaosValue,
          icon: line.icon ?? null,
          listings: line.listingCount ?? 0,
          trend7d: line.sparkLine?.totalChange ?? null,
          variants: 1,
        });
        continue;
      }
      const isMax = line.chaosValue > prev.chaos;
      map.set(key, {
        chaos: isMax ? line.chaosValue : prev.chaos,
        icon: isMax ? (line.icon ?? prev.icon) : prev.icon,
        listings: prev.listings + (line.listingCount ?? 0),
        trend7d: isMax ? (line.sparkLine?.totalChange ?? prev.trend7d) : prev.trend7d,
        variants: prev.variants + 1,
      });
    }
  }
  return map;
}

/** Awakened gems: pick the drop-state price (uncorrupted, level 1 preferred). */
function indexAwakenedGems(lines: NinjaStashLine[]): Map<string, NinjaStashLine> {
  const byName = new Map<string, NinjaStashLine[]>();
  for (const line of lines) {
    if (!line.name?.startsWith("Awakened") || line.corrupted) continue;
    if (!line.chaosValue || line.chaosValue <= 0) continue;
    const key = norm(line.name);
    byName.set(key, [...(byName.get(key) ?? []), line]);
  }
  const picked = new Map<string, NinjaStashLine>();
  for (const [key, variants] of byName) {
    const lvl1 = variants.filter((v) => (v.gemLevel ?? 1) === 1);
    const pool = lvl1.length > 0 ? lvl1 : variants;
    const best = [...pool].sort((a, b) => {
      const aPlain = a.gemQuality ? 1 : 0;
      const bPlain = b.gemQuality ? 1 : 0;
      if (aPlain !== bPlain) return aPlain - bPlain;
      return (b.listingCount ?? 0) - (a.listingCount ?? 0);
    })[0];
    picked.set(key, best);
  }
  return picked;
}

export async function getBossBoard(league: string): Promise<BossBoard | null> {
  const [flip, invitations, gemLines, ...uniqueSets] = await Promise.all([
    getFlipBoard(league, "Fragment"),
    stashLines(league, "Invitation"),
    stashLines(league, "SkillGem"),
    ...UNIQUE_TYPES.map((t) => stashLines(league, t)),
  ]);

  const cxById = new Map<string, FlipRow>();
  const cxByName = new Map<string, FlipRow>();
  for (const row of flip?.rows ?? []) {
    cxById.set(row.id, row);
    cxByName.set(norm(row.name), row);
  }
  const invByName = new Map<string, NinjaStashLine>();
  for (const line of invitations) {
    if (line.name) invByName.set(norm(line.name), line);
  }
  const uniques = indexUniques(uniqueSets);
  const gems = indexAwakenedGems(gemLines);

  const hasAnyData = cxById.size > 0 || uniques.size > 0 || invByName.size > 0;
  if (!hasAnyData) return null;

  const resolveDrop = (def: DropDef): BossDrop => {
    for (const candidate of [def.name, ...(def.aliases ?? [])]) {
      const key = norm(candidate);
      const unique = uniques.get(key);
      if (unique) {
        return {
          name: def.name,
          chaos: unique.chaos,
          icon: unique.icon,
          listings: unique.listings,
          trend7d: unique.trend7d,
          variants: unique.variants,
        };
      }
      const gem = gems.get(key);
      if (gem) {
        return {
          name: def.name,
          chaos: gem.chaosValue ?? null,
          icon: gem.icon ?? null,
          listings: gem.listingCount ?? null,
          trend7d: gem.sparkLine?.totalChange ?? null,
          variants: 1,
        };
      }
      const cx = cxByName.get(key);
      if (cx) {
        return {
          name: def.name,
          chaos: cx.chaosRate,
          icon: cx.image,
          listings: null,
          trend7d: cx.trend7d,
          variants: 1,
        };
      }
    }
    return { name: def.name, chaos: null, icon: null, listings: null, trend7d: null, variants: 0 };
  };

  const resolveCostItem = (item: CostItemDef): PricedCostItem => {
    if (item.cxId) {
      const row = cxById.get(item.cxId);
      return {
        label: item.label,
        qty: item.qty,
        unitChaos: row ? row.chaosRate : null,
        icon: row?.image ?? null,
      };
    }
    if (item.invName) {
      const line = invByName.get(norm(item.invName));
      return {
        label: item.label,
        qty: item.qty,
        unitChaos: line?.chaosValue ?? null,
        icon: line?.icon ?? null,
      };
    }
    return { label: item.label, qty: item.qty, unitChaos: null, icon: null };
  };

  const bosses: BossCard[] = BOSSES.map((def) => {
    const sections: BossSection[] = def.sections.map((sec) => {
      const items = sec.cost.map(resolveCostItem);
      const priced = items.filter((i) => i.unitChaos !== null);
      const drops = sec.drops
        .map(resolveDrop)
        .sort((a, b) => (b.chaos ?? -1) - (a.chaos ?? -1));
      return {
        label: sec.label,
        items,
        totalChaos: priced.reduce((sum, i) => sum + (i.unitChaos ?? 0) * i.qty, 0),
        missing: items.length - priced.length,
        costNote: sec.costNote,
        drops,
        note: sec.note,
      };
    });

    const primary = sections[0];
    const uberCostChaos =
      primary && primary.missing === 0 && primary.totalChaos > 0 ? primary.totalChaos : null;
    const allDropPrices = sections.flatMap((s) => s.drops).filter((d) => d.chaos !== null);
    return {
      id: def.id,
      name: def.name,
      subtitle: def.subtitle,
      sections,
      note: def.note,
      uberCostChaos,
      topDropChaos:
        allDropPrices.length > 0 ? Math.max(...allDropPrices.map((d) => d.chaos ?? 0)) : null,
    };
  });

  return {
    league: flip?.league ?? league,
    divinePrice: flip?.divinePrice ?? null,
    bosses,
    fetchedAt: Date.now(),
  };
}
