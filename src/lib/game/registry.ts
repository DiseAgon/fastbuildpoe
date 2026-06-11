/**
 * Per-game configuration. The global PoE1/PoE2 toggle selects one of these and
 * everything downstream (endpoints, web links, PoB root element) keys off it.
 *
 * League lists and stat databases are fetched at runtime per game (later phases);
 * this registry holds only the static, structural differences.
 */

export type GameId = "poe1" | "poe2";

export interface GameConfig {
  id: GameId;
  label: string;
  /** Base for trade API calls, e.g. POST `${tradeApiBase}/search/{league}`. */
  tradeApiBase: string;
  /** Base for human-facing trade pages: `${tradeWebBase}/search/{league}/{id}`. */
  tradeWebBase: string;
  /** Root XML element produced by Path of Building for this game. */
  pobRoot: string;
  /** Env var holding an optional default-league override. */
  defaultLeagueEnv: string;
  /** Trade query filter group for armour/defence stats (differs PoE1 vs PoE2). */
  equipmentFilterKey: string;
  /** Trade query filter group for weapon DPS stats. */
  weaponFilterKey: string;
  /** PoB GitHub repo (dev branch) whose Data/Bases lua files hold base-weapon stats. */
  pobRepo: string;
}

export const GAMES: Record<GameId, GameConfig> = {
  poe1: {
    id: "poe1",
    label: "Path of Exile",
    tradeApiBase: "https://www.pathofexile.com/api/trade",
    tradeWebBase: "https://www.pathofexile.com/trade",
    pobRoot: "PathOfBuilding",
    defaultLeagueEnv: "DEFAULT_LEAGUE_POE1",
    equipmentFilterKey: "armour_filters",
    weaponFilterKey: "weapon_filters",
    pobRepo: "PathOfBuildingCommunity/PathOfBuilding",
  },
  poe2: {
    id: "poe2",
    label: "Path of Exile 2",
    tradeApiBase: "https://www.pathofexile.com/api/trade2",
    tradeWebBase: "https://www.pathofexile.com/trade2",
    pobRoot: "PathOfBuilding2",
    defaultLeagueEnv: "DEFAULT_LEAGUE_POE2",
    equipmentFilterKey: "equipment_filters",
    weaponFilterKey: "equipment_filters",
    pobRepo: "PathOfBuildingCommunity/PathOfBuilding-PoE2",
  },
};

export const GAME_IDS: GameId[] = ["poe1", "poe2"];

export function getGame(id: GameId): GameConfig {
  return GAMES[id];
}

export function isGameId(value: string): value is GameId {
  return value === "poe1" || value === "poe2";
}
