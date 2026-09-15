/**
 * Per-game configuration. The global PoE1/PoE2 toggle selects one of these and
 * everything downstream (endpoints, web links) keys off it.
 */

export type GameId = "poe1" | "poe2";

export interface GameConfig {
  id: GameId;
  label: string;
  /** Base for trade API calls, e.g. POST `${tradeApiBase}/search/{league}`. */
  tradeApiBase: string;
  /** Base for human-facing trade pages: `${tradeWebBase}/search/{league}/{id}`. */
  tradeWebBase: string;
  /** Trade query filter group for armour/defence stats (differs PoE1 vs PoE2). */
  equipmentFilterKey: string;
  /** Trade query filter group for weapon DPS stats. */
  weaponFilterKey: string;
}

export const GAMES: Record<GameId, GameConfig> = {
  poe1: {
    id: "poe1",
    label: "Path of Exile",
    tradeApiBase: "https://www.pathofexile.com/api/trade",
    tradeWebBase: "https://www.pathofexile.com/trade",
    equipmentFilterKey: "armour_filters",
    weaponFilterKey: "weapon_filters",
  },
  poe2: {
    id: "poe2",
    label: "Path of Exile 2",
    tradeApiBase: "https://www.pathofexile.com/api/trade2",
    tradeWebBase: "https://www.pathofexile.com/trade2",
    equipmentFilterKey: "equipment_filters",
    weaponFilterKey: "equipment_filters",
  },
};

export const GAME_IDS: GameId[] = ["poe1", "poe2"];

export function getGame(id: GameId): GameConfig {
  return GAMES[id];
}

export function isGameId(value: string): value is GameId {
  return value === "poe1" || value === "poe2";
}
