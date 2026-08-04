/**
 * Live prices + artwork for the items in an imported build.
 *
 * Scope, deliberately: poe.ninja prices **uniques and gems**, so those are the
 * only things quoted here. Rares are priced by their mod rolls, which no
 * aggregate feed can know — poe.ninja's own build view doesn't price them
 * either. Rares still get their base artwork and keep the manual price box and
 * per-item trade link, which is the honest answer for them.
 *
 * Only PoE1 is covered: `ninja.ts` talks to the /poe1/ economy API, and the
 * PoE2 economy lives behind a different shape. Callers get an explicit
 * `supported: false` rather than silently empty prices.
 */

import { getDivinePrice, stashLines, UNIQUE_TYPES } from "./ninja";
import {
  indexBaseIcons,
  indexGemTiers,
  indexUniques,
  nearestGemTier,
  norm,
  resolveBaseIcon,
  type UniqueAgg,
} from "./priceIndex";

/** The item facts the pricer needs — a structural subset of ParsedItem. */
export interface PriceableItem {
  /** Stable key chosen by the caller; echoed back on the quote. */
  key: string;
  name: string;
  baseType: string;
  rarity: string;
  category: string;
  gemLevel?: number;
  quality?: number;
  corrupted?: boolean;
}

export type PriceSource = "unique" | "gem" | "none";

export interface ItemQuote {
  key: string;
  /** Chaos price of the matched line, null when nothing matched. */
  chaos: number | null;
  /** Same price in divines, for the build page's divine-denominated inputs. */
  divine: number | null;
  /** Item artwork (unique art, gem art, or the base type's art). */
  icon: string | null;
  /** True when the quote is a nearest-tier stand-in, not this exact item. */
  approx: boolean;
  /** What the price came from, so the UI can explain itself. */
  source: PriceSource;
  /** Open listings behind the price — low counts mean a soft number. */
  listings: number | null;
  /** Human-readable note when the match needed a compromise. */
  note?: string;
}

export interface BuildPriceResult {
  supported: boolean;
  league: string;
  divinePrice: number | null;
  quotes: ItemQuote[];
  /** Why nothing was priced, when supported is false. */
  reason?: string;
}

const UNPRICED = (key: string, icon: string | null): ItemQuote => ({
  key,
  chaos: null,
  divine: null,
  icon,
  approx: false,
  source: "none",
  listings: null,
});

function quoteUnique(item: PriceableItem, agg: UniqueAgg, divinePrice: number | null): ItemQuote {
  // Foulborn / mod-roll variants are priced as separate lines; we key by name
  // only, so flag that the number is a range rather than this item's roll.
  const approx = agg.variants > 1;
  return {
    key: item.key,
    chaos: agg.chaos,
    divine: divinePrice && divinePrice > 0 ? agg.chaos / divinePrice : null,
    icon: agg.icon,
    approx,
    source: "unique",
    listings: agg.listings,
    note: approx ? `${agg.variants} variants priced separately — shows one of them` : undefined,
  };
}

function describeGemGap(
  want: PriceableItem,
  got: { gemLevel?: number; gemQuality?: number; corrupted?: boolean },
): string {
  const parts: string[] = [];
  const wantLevel = want.gemLevel ?? 1;
  const wantQuality = want.quality ?? 0;
  if ((got.gemLevel ?? 1) !== wantLevel) parts.push(`lv ${got.gemLevel ?? 1} vs ${wantLevel}`);
  if ((got.gemQuality ?? 0) !== wantQuality) parts.push(`q${got.gemQuality ?? 0}% vs q${wantQuality}%`);
  if ((got.corrupted ?? false) !== (want.corrupted ?? false)) {
    parts.push(got.corrupted ? "corrupted" : "uncorrupted");
  }
  return `nearest listed tier (${parts.join(", ")})`;
}

export async function priceBuildItems(
  game: string,
  league: string,
  items: PriceableItem[],
): Promise<BuildPriceResult> {
  if (game !== "poe1") {
    return {
      supported: false,
      league,
      divinePrice: null,
      quotes: [],
      reason: "Live pricing is PoE1-only for now — poe.ninja's PoE2 economy API has a different shape.",
    };
  }

  const [divinePrice, gemLines, baseLines, clusterLines, flaskLines, ...uniqueSets] =
    await Promise.all([
      getDivinePrice(league),
      stashLines(league, "SkillGem"),
      stashLines(league, "BaseType"),
      // Cluster jewels are absent from BaseType and have their own category.
      stashLines(league, "ClusterJewel"),
      // So are flasks: BaseType carries 19k lines and not one of them is a
      // flask, which left every magic flask in a build with no artwork at all.
      stashLines(league, "Flask"),
      ...UNIQUE_TYPES.map((t) => stashLines(league, t)),
    ]);

  const uniques = indexUniques(uniqueSets);
  const gemTiers = indexGemTiers(gemLines);
  const baseIcons = indexBaseIcons([baseLines, clusterLines, flaskLines]);

  if (uniques.size === 0 && gemTiers.size === 0) {
    return {
      supported: false,
      league,
      divinePrice,
      quotes: [],
      reason: `poe.ninja returned no economy data for "${league}".`,
    };
  }

  const quotes = items.map((item): ItemQuote => {
    const baseIcon = resolveBaseIcon(item.baseType, baseIcons);

    if (item.category === "gem") {
      // PoB drops the " Support" suffix ("Enlighten", "Slower Projectiles"),
      // while poe.ninja keeps it — half a build's gems miss without this retry.
      const tiers =
        gemTiers.get(norm(item.name)) ?? gemTiers.get(norm(`${item.name} Support`));
      const hit = tiers
        ? nearestGemTier(tiers, {
            level: item.gemLevel,
            quality: item.quality,
            corrupted: item.corrupted,
          })
        : null;
      if (!hit) return UNPRICED(item.key, null);
      const chaos = hit.line.chaosValue ?? null;
      return {
        key: item.key,
        chaos,
        divine: chaos !== null && divinePrice && divinePrice > 0 ? chaos / divinePrice : null,
        icon: hit.line.icon ?? null,
        approx: !hit.exact,
        source: "gem",
        listings: hit.line.listingCount ?? null,
        note: hit.exact ? undefined : describeGemGap(item, hit.line),
      };
    }

    // Uniques are keyed on the unique's own name, not the base type.
    const agg = item.rarity === "unique" ? uniques.get(norm(item.name)) : undefined;
    if (agg) {
      const quote = quoteUnique(item, agg, divinePrice);
      return { ...quote, icon: quote.icon ?? baseIcon };
    }

    return UNPRICED(item.key, baseIcon);
  });

  return { supported: true, league, divinePrice, quotes };
}
