import type { GameId } from "@/lib/game/registry";
import gemsPoe1 from "@/data/poe/gemtypes.poe1.json";
import gemsPoe2 from "@/data/poe/gemtypes.poe2.json";

/**
 * Resolving a Path of Building gem name to something the trade site accepts.
 *
 * The two sides name gems differently and the gaps are not cosmetic — each one
 * produced an "Unknown item base type" error rather than a bad search:
 *
 *  - Supports: PoB stores the granted effect's name, which drops the suffix
 *    ("Multistrike", "Awakened Multistrike", "Greater Multistrike"). Trade only
 *    knows "Multistrike Support" and friends.
 *  - Transfigured skills: trade has no "Cyclone of Tumult" base type. It is the
 *    "Cyclone" base plus a discriminator (`alt_x`/`alt_y`/`alt_z`), which the
 *    query carries as `type: {option, discriminator}`.
 *  - Vaal transfigured gems are listed as "Vaal Cyclone (Cyclone of Tumult)",
 *    a display string PoB never writes; the parenthetical is indexed too.
 */

/** One entry of the trade `data/items` gem list (snapshotted, see scripts/snapshot.mjs). */
interface GemEntry {
  type: string;
  /** Display name, present only on transfigured variants. */
  text?: string;
  /** Discriminator that selects the variant behind a shared `type`. */
  disc?: string;
}

/** What a gem search needs: a base type, plus a discriminator for variants. */
export interface GemTypeRef {
  type: string;
  discriminator?: string;
}

const SOURCES: Record<GameId, GemEntry[]> = {
  poe1: gemsPoe1 as GemEntry[],
  poe2: gemsPoe2 as GemEntry[],
};

/** Case/punctuation-insensitive key — PoB and GGG disagree on apostrophes. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const indexCache: Partial<Record<GameId, Map<string, GemTypeRef>>> = {};

function buildIndex(entries: GemEntry[]): Map<string, GemTypeRef> {
  const index = new Map<string, GemTypeRef>();
  // First writer wins, so a plain base type is never shadowed by a variant that
  // happens to normalise onto it.
  const add = (key: string, ref: GemTypeRef) => {
    const k = norm(key);
    if (k && !index.has(k)) index.set(k, ref);
  };

  for (const entry of entries) {
    if (!entry.disc) {
      add(entry.type, { type: entry.type });
      // PoB drops " Support" from support gem names; index the bare form so
      // "Multistrike" resolves without every caller having to retry.
      const bare = entry.type.replace(/\s+Support$/i, "");
      if (bare !== entry.type) add(bare, { type: entry.type });
      continue;
    }
    const ref: GemTypeRef = { type: entry.type, discriminator: entry.disc };
    const text = entry.text ?? entry.type;
    add(text, ref);
    // "Vaal Cyclone (Cyclone of Tumult)" → also reachable as "Vaal Cyclone of
    // Tumult", the shape a PoB name would take.
    const paren = text.match(/^(\S+)\s+.*\((.+)\)$/);
    if (paren) add(`${paren[1]} ${paren[2]}`, ref);
  }
  return index;
}

function getIndex(game: GameId): Map<string, GemTypeRef> {
  const cached = indexCache[game];
  if (cached) return cached;
  const index = buildIndex(SOURCES[game]);
  indexCache[game] = index;
  return index;
}

/**
 * The trade base type (and variant discriminator) for a PoB gem name, or null
 * when this game does not trade the gem under its own name — PoE2 sells most
 * gems as Uncut gems, and callers fall back to that.
 */
export function resolveGemType(game: GameId, name: string): GemTypeRef | null {
  return getIndex(game).get(norm(name)) ?? null;
}
