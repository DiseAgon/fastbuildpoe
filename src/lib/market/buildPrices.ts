/**
 * Live prices + artwork for the items in an imported build.
 *
 * Scope, deliberately: poe.ninja prices **uniques and gems**, so those are the
 * only things quoted here. Rares are priced by their mod rolls, which no
 * aggregate feed can know — poe.ninja's own build view doesn't price them
 * either. Rares still get their base artwork and keep the manual price box and
 * per-item trade link, which is the honest answer for them.
 *
 * Both games are covered, by separate paths, because their feeds differ in more
 * than the URL: PoE2's categories are spelled plural, its lines carry
 * `primaryValue` instead of `chaosValue`, and that value is already denominated
 * in divines. PoE2 also has no gem or base-type economy on poe.ninja, so its
 * gems and rares stay honestly unpriced rather than being guessed at.
 */

import {
  getDivinePrice,
  stashLines,
  UNIQUE_TYPES,
  UNIQUE_TYPES_POE2,
  type NinjaStashLine,
} from "./ninja";
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
  if (game === "poe2") return pricePoe2(league, items);

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

/* ------------------------------------------------------------------------- *
 * PoE2
 * ------------------------------------------------------------------------- */

/** One priced PoE2 unique line, already denominated in divines. */
interface Poe2Unique {
  divine: number;
  icon: string | null;
  listings: number;
  baseType: string | null;
}

/**
 * PoE2 uniques, grouped by name. Simpler than the PoE1 index in one way — PoE2
 * has no link tiers and no `variant` labels — and harder in another: the same
 * unique is listed separately per base it can roll on, and those prices diverge
 * enormously. Morior Invictus is 2 div on a Grand Regalia and 15 div on a
 * Runemastered one; Temporalis is 3940 and 3900.
 *
 * Kept here rather than in `priceIndex.ts` so the PoE1 indexer that the Boss
 * board also depends on stays exactly as it is.
 */
function indexPoe2Uniques(lineSets: NinjaStashLine[][]): Map<string, Poe2Unique[]> {
  const map = new Map<string, Poe2Unique[]>();
  for (const lines of lineSets) {
    for (const line of lines) {
      const value = line.primaryValue;
      if (!line.name || !value || value <= 0) continue;
      const key = norm(line.name);
      map.set(key, [
        ...(map.get(key) ?? []),
        {
          divine: value,
          icon: line.icon ?? null,
          listings: line.listingCount ?? 0,
          baseType: line.baseType ?? null,
        },
      ]);
    }
  }
  return map;
}

/**
 * Pick the line for the base the build actually uses; fall back to the
 * best-listed one, which is the form people trade, and say that it is a
 * stand-in rather than this item's price.
 */
function pickPoe2Unique(
  lines: Poe2Unique[],
  baseType: string,
): { line: Poe2Unique; exact: boolean } | null {
  if (lines.length === 0) return null;
  if (lines.length === 1) return { line: lines[0], exact: true };
  const wanted = norm(baseType);
  const onBase = lines.find((l) => l.baseType && norm(l.baseType) === wanted);
  if (onBase) return { line: onBase, exact: true };
  const liquid = [...lines].sort((a, b) => b.listings - a.listings)[0];
  return { line: liquid, exact: false };
}

async function pricePoe2(league: string, items: PriceableItem[]): Promise<BuildPriceResult> {
  const uniqueSets = await Promise.all(
    UNIQUE_TYPES_POE2.map((type) => stashLines(league, type, "poe2")),
  );
  const uniques = indexPoe2Uniques(uniqueSets);

  if (uniques.size === 0) {
    return {
      supported: false,
      league,
      divinePrice: null,
      quotes: [],
      reason: `poe.ninja returned no PoE2 economy data for "${league}".`,
    };
  }

  const quotes = items.map((item): ItemQuote => {
    const lines = item.rarity === "unique" ? uniques.get(norm(item.name)) : undefined;
    const hit = lines ? pickPoe2Unique(lines, item.baseType) : null;
    if (!hit) return UNPRICED(item.key, null);
    return {
      key: item.key,
      // poe.ninja denominates PoE2 in divines, so there is no chaos figure to
      // report — and inventing one from the exchange rate would only add error.
      chaos: null,
      divine: hit.line.divine,
      icon: hit.line.icon,
      approx: !hit.exact,
      source: "unique",
      listings: hit.line.listings,
      note: hit.exact
        ? undefined
        : `priced on ${hit.line.baseType ?? "another base"}, not ${item.baseType}`,
    };
  });

  // divinePrice is chaos-per-divine, which PoE2 has no use for: its prices are
  // already divines.
  return { supported: true, league, divinePrice: null, quotes };
}
