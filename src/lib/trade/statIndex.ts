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
    .replace(/\ban additional\b/g, "# additional")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fallback key with plural word endings stripped, so PoB text like
 * "Totems fire 2 additional Projectiles" still finds the trade stat
 * "Totems fire # additional Projectile". Applied identically to both sides,
 * and only consulted when the exact key misses.
 */
function singularKey(normalized: string): string {
  return normalized.replace(/\b([a-z]{3,})s\b/g, "$1");
}

interface IndexedStat {
  entry: StatEntry;
  /** Trade option id when this key came from expanding an option-valued stat. */
  option?: number;
}

export interface StatIndex {
  byText: Map<string, IndexedStat[]>;
  bySingular: Map<string, IndexedStat[]>;
}

export interface StatMatch {
  entry: StatEntry;
  /** True when the source mod said "reduced" (value should be treated as negative). */
  negated: boolean;
  /** Trade option id for option-valued stats (e.g. "Only affects Passives in # Ring"). */
  option?: number;
}

/** Which trade stat types a parsed mod type may match, in priority order. */
const TYPE_FAMILY: Partial<Record<ModType, string[]>> = {
  explicit: ["explicit"],
  crafted: ["explicit", "implicit"],
  fractured: ["explicit"],
  implicit: ["implicit"],
  enchant: ["enchant"],
};

/**
 * Mod types that must not fall back to a same-text `explicit` stat.
 *
 * Crucible passives are not indexed at all (see buildIndex), so a crucible mod
 * never finds its own family and would otherwise take whatever explicit stat
 * shares its wording — turning the passive into a requirement for an explicit
 * mod the item does not have, which finds nothing. Reporting the line as
 * unsearchable is the honest result; the UI already renders it as "no stat".
 */
const NO_EXPLICIT_FALLBACK = new Set<ModType>(["crucible"]);

/**
 * Trailing qualifiers that name the item class a stat applies to rather than
 * distinguishing it from another stat. PoB never writes them, so the bare text
 * is indexed too — otherwise a shield's "+6% Chance to Block" cannot reach
 * "+#% Chance to Block (Shields)".
 *
 * Deliberately not "(Maps)", "(Legacy)" or "(Tier N)": those separate genuinely
 * different stats, and stripping them would merge stats that must stay apart.
 */
const ITEM_CLASS_QUALIFIERS = ["(local)", "(shields)", "(staves)"];

const indexCache: Partial<Record<GameId, StatIndex>> = {};

function addKey(map: Map<string, IndexedStat[]>, key: string, value: IndexedStat): void {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildIndex(entries: StatEntry[]): StatIndex {
  const byText = new Map<string, IndexedStat[]>();
  const bySingular = new Map<string, IndexedStat[]>();

  const add = (key: string, value: IndexedStat) => {
    addKey(byText, key, value);
    addKey(bySingular, singularKey(key), value);
  };

  for (const entry of entries) {
    // Pseudos are applied deliberately, not by text match.
    if (entry.type === "pseudo") continue;
    /**
     * Crucible passives are whole multi-line entries with literal rolls and a
     * "(Tier N)" suffix, so no PoB line can match one — but indexing their
     * first lines put them in the candidate pool for 833 ordinary mod texts,
     * and for those the crucible entry was the *only* candidate. A shield's
     * "+6% Chance to Block" resolved to crucible.mod_3453 ("+8% Chance to
     * Block\nCannot Block Spell Damage (Tier 1)") and the search found
     * nothing. They are excluded here rather than filtered at match time, so
     * they cannot shadow a real stat by any route.
     */
    if (entry.type === "crucible") continue;

    // Some stat texts are multi-line (e.g. "…your tree\nPassage" carries the
    // passive node name). Index the full text and the first line.
    const keys = new Set<string>([normalizeStatText(entry.text)]);
    const firstLine = entry.text.split("\n")[0];
    keys.add(normalizeStatText(firstLine));
    // Item-class qualifiers are on the trade side only ("98% increased Armour
    // and Evasion (Local)", "+#% Chance to Block (Shields)") — index the bare
    // text so PoB's unqualified wording reaches them.
    for (const key of [...keys]) {
      for (const qualifier of ITEM_CLASS_QUALIFIERS) {
        if (key.endsWith(` ${qualifier}`)) keys.add(key.slice(0, -(qualifier.length + 1)));
      }
    }
    for (const key of keys) add(key, { entry });

    // Option-valued stats ("Only affects Passives in # Ring"): expand each
    // option into its concrete text so PoB lines match and carry the option id.
    if (entry.options && entry.text.includes("#")) {
      for (const opt of entry.options) {
        add(normalizeStatText(entry.text.replace("#", opt.text)), {
          entry,
          option: opt.id,
        });
      }
    }
  }
  return { byText, bySingular };
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

/**
 * Find the best stat entry for a parsed mod, or null if unmatched.
 *
 * `preferTypes` is tried ahead of the mod type's own family. Some stats exist
 * under several types with the same id suffix and only one of them actually
 * returns results for a given item class — see the cluster-jewel case in
 * queryBuilder, where the explicit variant of "Adds # Passive Skills" matches
 * nothing and the enchant variant matches everything.
 */
export function matchMod(
  index: StatIndex,
  mod: ParsedMod,
  preferTypes?: string[],
): StatMatch | null {
  const key = normalizeStatText(mod.template);
  const candidates =
    index.byText.get(key) ?? index.bySingular.get(singularKey(key));
  if (!candidates || candidates.length === 0) return null;

  const family = [...(preferTypes ?? []), ...(TYPE_FAMILY[mod.type] ?? [])];
  let hit: IndexedStat | undefined;
  for (const type of family) {
    hit = candidates.find((c) => c.entry.type === type);
    if (hit) break;
  }
  if (!hit && NO_EXPLICIT_FALLBACK.has(mod.type)) return null;
  if (!hit) hit = candidates.find((c) => c.entry.type === "explicit") ?? candidates[0];

  return { entry: hit.entry, negated: /\breduced\b/i.test(mod.text), option: hit.option };
}
