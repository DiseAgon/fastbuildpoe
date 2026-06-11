import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import { TRADE_HEADERS, fetchWithTimeout } from "./http";
import metaPoe1 from "@/data/poe/meta.poe1.json";
import metaPoe2 from "@/data/poe/meta.poe2.json";

export interface TradeMeta {
  leagues: string[];
  defaultLeague: string;
  /** Absolute URL of this game's Divine Orb icon (differs PoE1 vs PoE2). */
  divineIcon: string | null;
}

/** Committed fallback so the deployed app works without reaching pathofexile.com. */
const SNAPSHOT: Record<GameId, TradeMeta> = {
  poe1: metaPoe1 as TradeMeta,
  poe2: metaPoe2 as TradeMeta,
};

const cache: Partial<Record<GameId, TradeMeta>> = {};

/**
 * Try live leagues (fresh per league); fall back fast to the bundled snapshot
 * when the host can't reach pathofexile.com (e.g. Cloudflare-blocked datacenter).
 * The UI also allows typing a custom league, so a stale list is never a hard block.
 */
export async function getTradeMeta(game: GameId): Promise<TradeMeta> {
  const cached = cache[game];
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(`${getGame(game).tradeApiBase}/data/leagues`, {
      headers: TRADE_HEADERS,
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { result?: Array<{ id?: string }> };
      const leagues = [
        ...new Set((json.result ?? []).map((l) => l.id).filter((id): id is string => !!id)),
      ];
      if (leagues.length > 0) {
        const main = leagues.find((l) => !/hardcore|ruthless|standard|ssf|\bhc\b/i.test(l));
        const meta: TradeMeta = {
          leagues,
          defaultLeague: main ?? leagues[0],
          divineIcon: SNAPSHOT[game].divineIcon,
        };
        cache[game] = meta;
        return meta;
      }
    }
  } catch {
    // fall through to snapshot
  }

  cache[game] = SNAPSHOT[game];
  return SNAPSHOT[game];
}
