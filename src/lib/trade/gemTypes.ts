import type { GameId } from "@/lib/game/registry";
import gemsPoe1 from "@/data/poe/gemtypes.poe1.json";
import gemsPoe2 from "@/data/poe/gemtypes.poe2.json";

/**
 * Valid trade gem `type` names per game (snapshot of data/items "Gems"). PoE2
 * trades most gems as Uncut gems, so a skill/support name like "Grace" is NOT a
 * valid type there — checking this avoids "Unknown item base type" link errors.
 */
const SETS: Record<GameId, Set<string>> = {
  poe1: new Set(gemsPoe1 as string[]),
  poe2: new Set(gemsPoe2 as string[]),
};

export function isValidGemType(game: GameId, name: string): boolean {
  return SETS[game].has(name);
}
