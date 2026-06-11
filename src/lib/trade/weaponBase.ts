import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import { TRADE_HEADERS, fetchWithTimeout } from "./http";

/**
 * Base-weapon stats (base physical damage, attack rate, crit) parsed from Path
 * of Building's `Data/Bases/*.lua` files. PoB regenerates these each league, so
 * this is the source to refresh. See DATA_SOURCES.md.
 */
export interface WeaponBase {
  physMin: number;
  physMax: number;
  /** Attacks per second. */
  aps: number;
  /** Base critical chance (percent). */
  crit: number;
}

/** Weapon-type lua files to read (superset across both games; 404s ignored). */
const WEAPON_FILES = [
  "axe",
  "bow",
  "claw",
  "crossbow",
  "dagger",
  "flail",
  "mace",
  "spear",
  "staff",
  "sword",
  "oneswd",
  "twoswd",
  "onemace",
  "twomace",
  "oneaxe",
  "twoaxe",
];

const cache: Partial<Record<GameId, Map<string, WeaponBase>>> = {};

function num(block: string, key: string): number | null {
  const m = block.match(new RegExp(`${key}\\s*=\\s*(\\d+(?:\\.\\d+)?)`));
  return m ? Number(m[1]) : null;
}

/** Parse `itemBases["Name"] = { ... weapon = { ... } ... }` entries from one lua file. */
function parseLua(text: string, into: Map<string, WeaponBase>): void {
  const chunks = text.split('itemBases["');
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const nameEnd = chunk.indexOf('"]');
    if (nameEnd === -1) continue;
    const name = chunk.slice(0, nameEnd);
    const weaponMatch = chunk.match(/weapon\s*=\s*\{([^}]*)\}/);
    if (!weaponMatch) continue;
    const block = weaponMatch[1];
    const physMin = num(block, "PhysicalMin");
    const physMax = num(block, "PhysicalMax");
    const aps = num(block, "AttackRateBase");
    const crit = num(block, "CritChanceBase");
    if (physMin === null || physMax === null || aps === null) continue;
    into.set(name, { physMin, physMax, aps, crit: crit ?? 0 });
  }
}

async function loadWeaponBases(game: GameId): Promise<Map<string, WeaponBase>> {
  const cached = cache[game];
  if (cached) return cached;

  const repo = getGame(game).pobRepo;
  const bases = new Map<string, WeaponBase>();
  const results = await Promise.all(
    WEAPON_FILES.map(async (file) => {
      try {
        const res = await fetchWithTimeout(
          `https://raw.githubusercontent.com/${repo}/dev/src/Data/Bases/${file}.lua`,
          { headers: TRADE_HEADERS, cache: "no-store" },
          5000,
        );
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    }),
  );
  for (const text of results) {
    if (text) parseLua(text, bases);
  }

  // Only cache a successful load.
  if (bases.size > 0) cache[game] = bases;
  return bases;
}

export async function getWeaponBase(
  game: GameId,
  baseType: string,
): Promise<WeaponBase | null> {
  const bases = await loadWeaponBases(game);
  return bases.get(baseType) ?? null;
}
