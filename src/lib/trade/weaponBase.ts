import type { GameId } from "@/lib/game/registry";
import weaponsPoe1 from "@/data/poe/weapons.poe1.json";
import weaponsPoe2 from "@/data/poe/weapons.poe2.json";

/**
 * Base-weapon stats (base physical damage, attack rate, crit). Parsed from Path
 * of Building's `Data/Bases/*.lua` and committed as a snapshot (see
 * scripts/snapshot.mjs + DATA_SOURCES.md) so trade-link generation does no
 * runtime GitHub fetch — much faster and deterministic. Re-snapshot per league.
 */
export interface WeaponBase {
  physMin: number;
  physMax: number;
  aps: number;
  crit: number;
}

const SNAPSHOT: Record<GameId, Record<string, WeaponBase>> = {
  poe1: weaponsPoe1 as Record<string, WeaponBase>,
  poe2: weaponsPoe2 as Record<string, WeaponBase>,
};

export function getWeaponBase(game: GameId, baseType: string): WeaponBase | null {
  return SNAPSHOT[game][baseType] ?? null;
}
