import type { GameId } from "@/lib/game/registry";
import type { ModType, ParsedMod } from "@/types/item";
import { loadStats, type StatEntry } from "./statData";

/**
 * Normalize mod / stat text so a parsed mod template and a trade stat entry
 * compare equal. Both sides already use `#` for numeric rolls; we additionally
 * lowercase, drop `+` signs, collapse whitespace, and unify `reduced`→`increased`
 * (the trade API uses the `increased` stat with a negative value for both).
 */
export function normalizeStatText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\+/g, "")
    .replace(/-?\d+(?:\.\d+)?/g, "#")
    .replace(/\breduced\b/g, "increased")
    .replace(/\s+/g, " ")
    .trim();
}

export interface StatIndex {
  byText: Map<string, StatEntry[]>;
}

export interface StatMatch {
  entry: StatEntry;
  /** True when the source mod said "reduced" (value should be treated as negative). */
  negated: boolean;
}

/** Which trade stat types a parsed mod type may match, in priority order. */
const TYPE_FAMILY: Partial<Record<ModType, string[]>> = {
  explicit: ["explicit"],
  crafted: ["explicit", "implicit"],
  fractured: ["explicit"],
  implicit: ["implicit"],
  enchant: ["enchant"],
};

const indexCache: Partial<Record<GameId, StatIndex>> = {};

function buildIndex(entries: StatEntry[]): StatIndex {
  const byText = new Map<string, StatEntry[]>();
  for (const entry of entries) {
    if (entry.type === "pseudo") continue; // pseudos are applied deliberately, not by text match
    const key = normalizeStatText(entry.text);
    const list = byText.get(key);
    if (list) list.push(entry);
    else byText.set(key, [entry]);
  }
  return { byText };
}

export async function getStatIndex(game: GameId): Promise<StatIndex> {
  const cached = indexCache[game];
  if (cached) return cached;
  const entries = await loadStats(game);
  const index = buildIndex(entries);
  // Only cache a "real" index (the fallback is small); mirrors loadStats caching.
  if (entries.length > 50) indexCache[game] = index;
  return index;
}

/** Find the best stat entry for a parsed mod, or null if unmatched. */
export function matchMod(index: StatIndex, mod: ParsedMod): StatMatch | null {
  const key = normalizeStatText(mod.template);
  const entries = index.byText.get(key);
  if (!entries || entries.length === 0) return null;

  const family = TYPE_FAMILY[mod.type];
  let entry: StatEntry | undefined;
  if (family) {
    for (const type of family) {
      entry = entries.find((e) => e.type === type);
      if (entry) break;
    }
  }
  if (!entry) entry = entries.find((e) => e.type === "explicit") ?? entries[0];

  return { entry, negated: /\breduced\b/i.test(mod.text) };
}
