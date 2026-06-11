import type { GameId } from "@/lib/game/registry";
import statsPoe1 from "@/data/poe/stats.poe1.json";
import statsPoe2 from "@/data/poe/stats.poe2.json";

/** A single trade stat: maps display text (with `#` placeholders) to a stat id. */
export interface StatEntry {
  id: string;
  text: string;
  type: string;
}

/**
 * Stats are served from a committed snapshot (see scripts/snapshot.mjs and
 * DATA_SOURCES.md). This keeps the deployed app working without live-fetching
 * pathofexile.com, whose Cloudflare blocks datacenter IPs. Re-snapshot per league.
 */
const SNAPSHOT: Record<GameId, StatEntry[]> = {
  poe1: statsPoe1 as StatEntry[],
  poe2: statsPoe2 as StatEntry[],
};

export async function loadStats(game: GameId): Promise<StatEntry[]> {
  return SNAPSHOT[game];
}
