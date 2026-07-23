/**
 * Boss Profit board — cost to open each uber pinnacle fight vs live prices of
 * its notable drops, so early-league boss farmers can see what actually pays.
 *
 * Costs come from the in-game Currency Exchange (Fragment category) and the
 * trade-site Invitation category. Drops come from the unique-item overviews
 * plus SkillGem (Awakened gems) — all via poe.ninja.
 *
 * Access recipes and drop pools verified against the official 3.29-era state:
 * every classic uber is opened with 5 boss-specific fragments dropped in T17
 * maps (3.24 rework); the three Incarnation bosses (3.26) have harder versions
 * via their Echo / fragment items (3.27).
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

interface CostGroupDef {
  label: string;
  items: CostItemDef[];
}

interface DropDef {
  name: string;
  uberOnly?: boolean;
  /** Alternate spellings seen in the wild (source typos, renames). */
  aliases?: string[];
}

interface BossDef {
  id: string;
  name: string;
  subtitle: string;
  costGroups: CostGroupDef[];
  drops: DropDef[];
  /** Appends the live top Awakened gems to the drop list (The Feared). */
  awakenedGems?: boolean;
  note?: string;
}

const UBER = (name: string, aliases?: string[]): DropDef => ({ name, uberOnly: true, aliases });
const BASE = (name: string, aliases?: string[]): DropDef => ({ name, aliases });

const BOSSES: BossDef[] = [
  {
    id: "uber-maven",
    name: "Uber Maven",
    subtitle: "5× Reality Fragment (T17 drops) — standard fight: The Maven's Writ",
    costGroups: [
      { label: "Uber", items: [{ cxId: "reality-fragment", label: "Reality Fragment", qty: 5 }] },
      { label: "Standard", items: [{ cxId: "the-mavens-writ", label: "The Maven's Writ", qty: 1 }] },
    ],
    drops: [
      UBER("Progenesis"),
      UBER("Impossible Escape"),
      UBER("Viridi's Veil"),
      UBER("Grace of the Goddess"),
      UBER("Awakened Empower Support"),
      UBER("Awakened Enlighten Support"),
      UBER("Awakened Enhance Support"),
      BASE("Legacy of Fury"),
      BASE("Graven's Secret"),
      BASE("Arn's Anguish"),
      BASE("Olesya's Delight"),
      BASE("Doppelgänger Guise"),
      BASE("Echoforge"),
    ],
    note: "Also drops Orb of Conflict; uber adds Shiny Reliquary Key / Curio of Potential.",
  },
  {
    id: "uber-sirus",
    name: "Uber Sirus",
    subtitle: "5× Awakening Fragment — standard fight: the four Conqueror crests",
    costGroups: [
      { label: "Uber", items: [{ cxId: "awakening-fragment", label: "Awakening Fragment", qty: 5 }] },
      {
        label: "Standard",
        items: [
          { cxId: "al-hezmins-crest", label: "Al-Hezmin's Crest", qty: 1 },
          { cxId: "barans-crest", label: "Baran's Crest", qty: 1 },
          { cxId: "droxs-crest", label: "Drox's Crest", qty: 1 },
          { cxId: "veritanias-crest", label: "Veritania's Crest", qty: 1 },
        ],
      },
    ],
    drops: [
      UBER("The Saviour"),
      UBER("Oriath's End"),
      UBER("The Tempest Rising"),
      BASE("Thread of Hope"),
      BASE("Crown of the Inward Eye"),
      BASE("Hands of the High Templar"),
      BASE("The Burden of Truth"),
    ],
    note: "Massive-ring Thread of Hope is uber-only. Also drops Awakener's Orb / Orb of Dominance.",
  },
  {
    id: "uber-exarch",
    name: "Uber Searing Exarch",
    subtitle: "5× Blazing Fragment — standard fight: Incandescent Invitation",
    costGroups: [
      { label: "Uber", items: [{ cxId: "blazing-fragment", label: "Blazing Fragment", qty: 5 }] },
      { label: "Standard", items: [{ invName: "Incandescent Invitation", label: "Incandescent Invitation", qty: 1 }] },
    ],
    drops: [
      UBER("Crystallised Omniscience"),
      UBER("The Annihilating Light"),
      UBER("Annihilation's Approach"),
      UBER("The Celestial Brace"),
      BASE("Dissolution of the Flesh"),
      BASE("Dawnbreaker"),
      BASE("Dawnstrider"),
      BASE("Forbidden Flame"),
    ],
    note: "Also drops Exceptional Eldritch Embers and Eldritch currency.",
  },
  {
    id: "uber-eater",
    name: "Uber Eater of Worlds",
    subtitle: "5× Devouring Fragment — standard fight: Polaric Invitation",
    costGroups: [
      { label: "Uber", items: [{ cxId: "devouring-fragment", label: "Devouring Fragment", qty: 5 }] },
      { label: "Standard", items: [{ invName: "Polaric Invitation", label: "Polaric Invitation", qty: 1 }] },
    ],
    drops: [
      UBER("Nimis"),
      UBER("Ashes of the Stars"),
      UBER("Ravenous Passion"),
      BASE("Melding of the Flesh"),
      BASE("The Gluttonous Tide"),
      BASE("Inextricable Fate"),
      BASE("Forbidden Flesh"),
    ],
    note: "Also drops Exceptional Eldritch Ichors and Eldritch currency.",
  },
  {
    id: "uber-shaper",
    name: "Uber Shaper",
    subtitle: "5× Cosmic Fragment — standard fight: the four Shaper Guardian fragments",
    costGroups: [
      { label: "Uber", items: [{ cxId: "cosmic-fragment", label: "Cosmic Fragment", qty: 5 }] },
      {
        label: "Standard",
        items: [
          { cxId: "phoenix", label: "Fragment of the Phoenix", qty: 1 },
          { cxId: "chimer", label: "Fragment of the Chimera", qty: 1 },
          { cxId: "minot", label: "Fragment of the Minotaur", qty: 1 },
          { cxId: "hydra", label: "Fragment of the Hydra", qty: 1 },
        ],
      },
    ],
    drops: [
      UBER("Sublime Vision"),
      UBER("Starforge"),
      UBER("Echoes of Creation"),
      UBER("Entropic Devastation"),
      UBER("The Tides of Time"),
      BASE("Dying Sun"),
      BASE("Solstice Vigil"),
      BASE("Shaper's Touch"),
      BASE("Voidwalker"),
    ],
    note: "Also drops Orb of Dominance and a guaranteed Fragment of Knowledge/Shape.",
  },
  {
    id: "uber-uber-elder",
    name: "Uber Uber Elder",
    subtitle: "5× Decaying Fragment — standard fight: Terror + Emptiness + Shape + Knowledge",
    costGroups: [
      { label: "Uber", items: [{ cxId: "decaying-fragment", label: "Decaying Fragment", qty: 5 }] },
      {
        label: "Standard",
        items: [
          { cxId: "fragment-of-terror", label: "Fragment of Terror", qty: 1 },
          { cxId: "fragment-of-emptiness", label: "Fragment of Emptiness", qty: 1 },
          { cxId: "fragment-of-shape", label: "Fragment of Shape", qty: 1 },
          { cxId: "fragment-of-knowledge", label: "Fragment of Knowledge", qty: 1 },
        ],
      },
    ],
    drops: [
      UBER("Voidforge"),
      UBER("Sublime Vision"),
      UBER("The Eternity Shroud"),
      UBER("Soul Ascension"),
      UBER("Call of the Void"),
      UBER("The Devourer of Minds"),
      BASE("Watcher's Eye"),
      BASE("Indigon"),
      BASE("Disintegrator"),
      BASE("Voidfletcher"),
      BASE("Mark of the Elder"),
      BASE("Mark of the Shaper"),
    ],
    note: "Uber also adds the 2-curse Impresence variant and Orb of Dominance.",
  },
  {
    id: "uber-venarius",
    name: "Uber Venarius (Cortex)",
    subtitle: "5× Synthesising Fragment — standard fight: Cortex unique map",
    costGroups: [
      { label: "Uber", items: [{ cxId: "synthesising-fragment", label: "Synthesising Fragment", qty: 5 }] },
    ],
    drops: [
      BASE("Rational Doctrine"),
      BASE("Bottled Faith"),
      BASE("Garb of the Ephemeral"),
      BASE("Offering to the Serpent"),
      BASE("Circle of Ambition"),
    ],
    note: "Uber adds 3 extra synthesised rares with rarer implicits — much of the value is in those.",
  },
  {
    id: "incarnation-fear",
    name: "Uber Incarnation of Fear",
    subtitle: "4× Traumatic Fragment (harder, lv85) — Echo of Trauma enters the fight directly",
    costGroups: [
      { label: "Uber", items: [{ cxId: "traumatic-fragment", label: "Traumatic Fragment", qty: 4 }] },
      { label: "Echo", items: [{ cxId: "echo-of-trauma", label: "Echo of Trauma", qty: 1 }] },
    ],
    drops: [
      BASE("Starcaller"),
      BASE("Enmity's Embrace", ["Emnity's Embrace"]),
      BASE("Coiling Whisper"),
      BASE("Servant of Decay"),
    ],
    note: "Guaranteed one unique from the pool per kill.",
  },
  {
    id: "incarnation-neglect",
    name: "Uber Incarnation of Neglect",
    subtitle: "4× Lonely Fragment (harder, lv85) — Echo of Loneliness enters the fight directly",
    costGroups: [
      { label: "Uber", items: [{ cxId: "lonely-fragment", label: "Lonely Fragment", qty: 4 }] },
      { label: "Echo", items: [{ cxId: "echo-of-loneliness", label: "Echo of Loneliness", qty: 1 }] },
    ],
    drops: [
      BASE("Legacy of the Rose"),
      BASE("Venarius' Astrolabe"),
      BASE("Arkhon's Tools"),
      BASE("Betrayal's String"),
    ],
    note: "Guaranteed one unique from the pool per kill.",
  },
  {
    id: "incarnation-dread",
    name: "Uber Incarnation of Dread",
    subtitle: "4× Reverent Fragment (harder, lv85) — Echo of Reverence enters the fight directly",
    costGroups: [
      { label: "Uber", items: [{ cxId: "reverent-fragment", label: "Reverent Fragment", qty: 4 }] },
      { label: "Echo", items: [{ cxId: "echo-of-reverence", label: "Echo of Reverence", qty: 1 }] },
    ],
    drops: [
      BASE("Wine of the Prophet"),
      BASE("Seven Teachings"),
      BASE("The Dark Monarch"),
      BASE("Whispers of Infinity"),
    ],
    note: "Guaranteed one unique from the pool per kill.",
  },
  {
    id: "the-feared",
    name: "The Feared",
    subtitle: "Maven's Invitation: The Feared — Atziri + Chayula + Cortex + Shaper + Elder at once",
    costGroups: [
      {
        label: "Invitation",
        items: [{ invName: "Maven's Invitation: The Feared", label: "Maven's Invitation: The Feared", qty: 1 }],
      },
    ],
    drops: [],
    awakenedGems: true,
    note:
      "The invitation drops while running the five member fights (Cortex, Chayula's Domain, The Alluring Abyss, The Shaper's Realm, Uber Elder arena). Rewards: Awakened gems (below), the members' own loot pools and 10 Crescent Splinters.",
  },
];

export interface PricedCostItem {
  label: string;
  qty: number;
  unitChaos: number | null;
  icon: string | null;
}

export interface PricedCostGroup {
  label: string;
  items: PricedCostItem[];
  /** Sum over the priced items only. */
  totalChaos: number;
  /** How many items had no price (total is a lower bound when > 0). */
  missing: number;
}

export interface BossDrop {
  name: string;
  uberOnly: boolean;
  chaos: number | null;
  icon: string | null;
  listings: number | null;
  trend7d: number | null;
  /** Number of price lines merged (unique variants); price shown is the max. */
  variants: number;
}

export interface BossCard {
  id: string;
  name: string;
  subtitle: string;
  costGroups: PricedCostGroup[];
  drops: BossDrop[];
  note?: string;
  /** Primary (first) cost group total — the uber entry cost. */
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
          uberOnly: def.uberOnly ?? false,
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
          uberOnly: def.uberOnly ?? false,
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
          uberOnly: def.uberOnly ?? false,
          chaos: cx.chaosRate,
          icon: cx.image,
          listings: null,
          trend7d: cx.trend7d,
          variants: 1,
        };
      }
    }
    return {
      name: def.name,
      uberOnly: def.uberOnly ?? false,
      chaos: null,
      icon: null,
      listings: null,
      trend7d: null,
      variants: 0,
    };
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

  const awakenedTop: BossDrop[] = [...gems.entries()]
    .map(([, line]) => ({
      name: line.name ?? "Awakened gem",
      uberOnly: false,
      chaos: line.chaosValue ?? null,
      icon: line.icon ?? null,
      listings: line.listingCount ?? null,
      trend7d: line.sparkLine?.totalChange ?? null,
      variants: 1,
    }))
    .sort((a, b) => (b.chaos ?? 0) - (a.chaos ?? 0))
    .slice(0, 12);

  const bosses: BossCard[] = BOSSES.map((def) => {
    const costGroups: PricedCostGroup[] = def.costGroups.map((group) => {
      const items = group.items.map(resolveCostItem);
      const priced = items.filter((i) => i.unitChaos !== null);
      return {
        label: group.label,
        items,
        totalChaos: priced.reduce((sum, i) => sum + (i.unitChaos ?? 0) * i.qty, 0),
        missing: items.length - priced.length,
      };
    });
    const drops = [
      ...def.drops.map(resolveDrop),
      ...(def.awakenedGems ? awakenedTop : []),
    ].sort((a, b) => (b.chaos ?? -1) - (a.chaos ?? -1));

    const primary = costGroups[0];
    const uberCostChaos =
      primary && primary.missing === 0 && primary.totalChaos > 0 ? primary.totalChaos : null;
    const pricedDrops = drops.filter((d) => d.chaos !== null);
    return {
      id: def.id,
      name: def.name,
      subtitle: def.subtitle,
      costGroups,
      drops,
      note: def.note,
      uberCostChaos,
      topDropChaos: pricedDrops.length > 0 ? pricedDrops[0].chaos : null,
    };
  });

  return {
    league: flip?.league ?? league,
    divinePrice: flip?.divinePrice ?? null,
    bosses,
    fetchedAt: Date.now(),
  };
}
