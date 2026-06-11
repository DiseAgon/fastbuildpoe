import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import { getTradeMeta } from "./meta";

/**
 * Resolve the default trade league for a game: an explicit env override, else
 * the default from trade metadata (live with bundled-snapshot fallback).
 */
export async function resolveLeague(game: GameId): Promise<string> {
  const override = process.env[getGame(game).defaultLeagueEnv];
  if (override) return override;
  const meta = await getTradeMeta(game);
  return meta.defaultLeague || "Standard";
}
