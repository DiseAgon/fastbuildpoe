import type { GameId } from "@/lib/game/registry";
import { getGame } from "@/lib/game/registry";
import type { TradeQuery } from "./queryBuilder";

/**
 * Build a clickable official trade-search URL using the site's `?q=` parameter,
 * which prefills the search from a JSON query — no API POST, so no rate limits
 * or Cloudflare involved in link generation (that only matters for price fetch).
 */
export function buildTradeUrl(
  game: GameId,
  league: string,
  query: TradeQuery,
): string {
  const payload = { query, sort: { price: "asc" } };
  const q = encodeURIComponent(JSON.stringify(payload));
  return `${getGame(game).tradeWebBase}/search/${encodeURIComponent(league)}?q=${q}`;
}
