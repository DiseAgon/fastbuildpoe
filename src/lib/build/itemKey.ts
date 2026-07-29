import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";

/**
 * Stable identity for an item within a build, used as the key for both manual
 * price overrides (persisted in share links) and live quotes. Gems key on
 * level/quality because those change the price; gear keys on slot so two copies
 * of the same ring can be priced apart.
 *
 * Shared by `BuildContext` and the price-fetching hook — they must agree, or
 * quotes silently fail to line up with the cards that requested them.
 */
export function itemKey(game: GameId, item: ParsedItem): string {
  return item.category === "gem"
    ? `${game}|gem|${item.name}|${item.gemLevel ?? ""}|${item.quality ?? ""}`
    : `${game}|${item.category}|${item.name}|${item.baseType}|${item.slot ?? ""}`;
}
