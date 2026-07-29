/**
 * Shared poe.ninja price/icon indexes.
 *
 * Two consumers with different needs share this module:
 *  - the Boss Profit board wants the *drop state* of an item (what the boss
 *    actually hands you: unlinked, level 1, 0 quality, uncorrupted);
 *  - the build pricer wants the *closest listed tier* to a specific item a
 *    build asks for (a level 21 / 23% quality corrupted gem, say).
 *
 * Both start from the same stash-overview lines, so the indexing lives here
 * rather than being duplicated per caller.
 */

import type { NinjaStashLine } from "./ninja";

/** Case/punctuation-insensitive key — poe.ninja and PoB disagree on apostrophes. */
export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface UniqueAgg {
  chaos: number;
  icon: string | null;
  listings: number;
  trend7d: number | null;
  /** Distinct variant rolls priced separately (0 when the unique has none). */
  variants: number;
}

/**
 * poe.ninja splits a unique into one price line per link tier (…-5l, …-6l).
 * An item drops unlinked, so the 5L/6L lines price the linking, not the item —
 * pricing off the max overstated Servant of Decay by 87×. Price from the
 * unlinked line and count only genuine `variant` labels as variants.
 */
export function indexUniques(lineSets: NinjaStashLine[][]): Map<string, UniqueAgg> {
  const byKey = new Map<string, NinjaStashLine[]>();
  for (const lines of lineSets) {
    for (const line of lines) {
      if (!line.name || !line.chaosValue || line.chaosValue <= 0) continue;
      const key = norm(line.name);
      byKey.set(key, [...(byKey.get(key) ?? []), line]);
    }
  }

  const map = new Map<string, UniqueAgg>();
  for (const [key, lines] of byKey) {
    const dropState = [...lines].sort((a, b) => {
      const byLinks = (a.links ?? 0) - (b.links ?? 0);
      if (byLinks !== 0) return byLinks;
      return (b.listingCount ?? 0) - (a.listingCount ?? 0);
    })[0];
    map.set(key, {
      chaos: dropState.chaosValue ?? 0,
      icon: dropState.icon ?? null,
      listings: lines.reduce((sum, l) => sum + (l.listingCount ?? 0), 0),
      trend7d: dropState.sparkLine?.totalChange ?? null,
      variants: new Set(lines.map((l) => l.variant).filter(Boolean)).size,
    });
  }
  return map;
}

/** Boss-dropped gems: price the drop state (uncorrupted, level 1, no quality). */
export function indexDropStateGems(lines: NinjaStashLine[]): Map<string, NinjaStashLine> {
  const byName = new Map<string, NinjaStashLine[]>();
  for (const line of lines) {
    if (!line.name || line.corrupted) continue;
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

/** Every priced line for a gem name, for nearest-tier matching. */
export function indexGemTiers(lines: NinjaStashLine[]): Map<string, NinjaStashLine[]> {
  const byName = new Map<string, NinjaStashLine[]>();
  for (const line of lines) {
    if (!line.name || !line.chaosValue || line.chaosValue <= 0) continue;
    const key = norm(line.name);
    byName.set(key, [...(byName.get(key) ?? []), line]);
  }
  return byName;
}

/**
 * poe.ninja only lists the tiers people actually trade (1/0, 1/20, 1/23, 20/0,
 * 20/20, 20/23, 21/…), so a build's exact gem often has no line. Pick the
 * nearest tier and report whether it was an exact hit — a 20/20 price standing
 * in for a 19/0 gem must not be presented as that gem's price.
 */
export function nearestGemTier(
  tiers: NinjaStashLine[],
  want: { level?: number; quality?: number; corrupted?: boolean },
): { line: NinjaStashLine; exact: boolean } | null {
  if (tiers.length === 0) return null;
  const wantLevel = want.level ?? 1;
  const wantQuality = want.quality ?? 0;
  const wantCorrupted = want.corrupted ?? false;

  const cost = (l: NinjaStashLine): number => {
    const level = Math.abs((l.gemLevel ?? 1) - wantLevel);
    const quality = Math.abs((l.gemQuality ?? 0) - wantQuality);
    const corrupted = (l.corrupted ?? false) === wantCorrupted ? 0 : 1;
    // Level dominates (a level gap changes power far more than 20% quality),
    // then corruption, then quality.
    return level * 1000 + corrupted * 100 + quality;
  };

  const best = [...tiers].sort((a, b) => {
    const byCost = cost(a) - cost(b);
    if (byCost !== 0) return byCost;
    return (b.listingCount ?? 0) - (a.listingCount ?? 0);
  })[0];
  return { line: best, exact: cost(best) === 0 };
}

/**
 * baseType → icon, for rares and magic/normal items that have no unique entry.
 * We only keep the artwork, and one icon per base is enough since influence
 * does not change the art.
 *
 * Fed from several overviews: BaseType covers gear and jewels but carries no
 * cluster jewels, which have their own category.
 */
export function indexBaseIcons(lineSets: NinjaStashLine[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const lines of lineSets) {
    for (const line of lines) {
      const name = line.baseType ?? line.name;
      if (!name || !line.icon) continue;
      const key = norm(name);
      if (!map.has(key)) map.set(key, line.icon);
    }
  }
  return map;
}

/** Below this many characters a suffix match is too weak to trust. */
const MIN_BASE_MATCH = 6;

/**
 * Find the artwork for an item's base type.
 *
 * PoB writes magic items as a single affixed line ("Alchemist's Quartz Flask of
 * Craft"), so the parsed base keeps its prefix and never matches a feed key
 * exactly. Fall back to the longest known base the string *ends with* —
 * prefixes come first, so "alchemistsquartzflask" ends with "quartzflask".
 * Longest wins so "Prismatic Tincture" beats a shorter accidental tail.
 */
export function resolveBaseIcon(
  baseType: string,
  icons: Map<string, string>,
): string | null {
  if (!baseType) return null;
  const key = norm(baseType);
  const exact = icons.get(key);
  if (exact) return exact;

  let best: { len: number; icon: string } | null = null;
  for (const [candidate, icon] of icons) {
    if (candidate.length < MIN_BASE_MATCH || candidate.length >= key.length) continue;
    if (!key.endsWith(candidate)) continue;
    if (!best || candidate.length > best.len) best = { len: candidate.length, icon };
  }
  return best?.icon ?? null;
}
