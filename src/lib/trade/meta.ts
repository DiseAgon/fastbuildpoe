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

/** Refetch live leagues after this long, so a long-lived server instance picks
 * up a new league (e.g. at a 3.xx launch) without a redeploy. */
const CACHE_TTL_MS = 30 * 60 * 1000;
/** Retry sooner when we only had the bundled snapshot to serve. */
const FALLBACK_TTL_MS = 5 * 60 * 1000;

const cache: Partial<Record<GameId, { meta: TradeMeta; expires: number }>> = {};

/**
 * Try live leagues (fresh per league); fall back fast to the bundled snapshot
 * when the host can't reach pathofexile.com (e.g. Cloudflare-blocked datacenter).
 * The UI also allows typing a custom league, so a stale list is never a hard block.
 */
export async function getTradeMeta(game: GameId): Promise<TradeMeta> {
  const cached = cache[game];
  if (cached && cached.expires > Date.now()) return cached.meta;

  for (let attempt = 0; attempt < 2; attempt++) {
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
          cache[game] = { meta, expires: Date.now() + CACHE_TTL_MS };
          return meta;
        }
      }
    } catch {
      // retry once, then fall through to snapshot
    }
  }

  console.warn(`[trade/meta] live league fetch failed for ${game}; serving bundled snapshot.`);
  cache[game] = { meta: SNAPSHOT[game], expires: Date.now() + FALLBACK_TTL_MS };
  return SNAPSHOT[game];
}
