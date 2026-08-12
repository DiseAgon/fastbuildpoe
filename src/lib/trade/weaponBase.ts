import type { GameId } from "@/lib/game/registry";
import weaponsPoe1 from "@/data/poe/weapons.poe1.json";
import weaponsPoe2 from "@/data/poe/weapons.poe2.json";
import weaponClassesPoe1 from "@/data/poe/weaponclasses.poe1.json";
import weaponClassesPoe2 from "@/data/poe/weaponclasses.poe2.json";

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
  /** PoB's exact base class, e.g. `Two Handed Axe`. */
  itemClass: string;
  /** More specific PoB class when present, e.g. `Warstaff` or `Rune Dagger`. */
  itemSubClass?: string;
  /** Corresponding official trade category, e.g. `weapon.twoaxe`. */
  tradeCategory: string;
}

const SNAPSHOT: Record<GameId, Record<string, WeaponBase>> = {
  poe1: weaponsPoe1 as Record<string, WeaponBase>,
  poe2: weaponsPoe2 as Record<string, WeaponBase>,
};

interface WeaponClass {
  itemClass: string;
  itemSubClass?: string;
  tradeCategory: string;
}

const CLASS_SNAPSHOT: Record<GameId, Record<string, WeaponClass>> = {
  poe1: weaponClassesPoe1 as Record<string, WeaponClass>,
  poe2: weaponClassesPoe2 as Record<string, WeaponClass>,
};

export function getWeaponBase(game: GameId, baseType: string): WeaponBase | null {
  return SNAPSHOT[game][baseType] ?? null;
}

export function getWeaponTradeCategory(game: GameId, baseType: string): string | null {
  return CLASS_SNAPSHOT[game][baseType]?.tradeCategory ?? null;
}
