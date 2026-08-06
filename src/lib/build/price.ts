import type { ItemQuote } from "@/lib/market/buildPrices";

/**
 * The price actually in force for an item: the manual override when the user
 * typed one, otherwise the live poe.ninja quote.
 *
 * Shared by `BuildContext` (which renders the totals) and the page (which
 * records a total when saving a session) — they must agree, or a saved build
 * shows a number the screen never displayed.
 */
export function effectivePrice(
  prices: Record<string, string>,
  quotes: Record<string, ItemQuote>,
  key: string,
): number {
  const override = Number.parseFloat(prices[key] || "");
  if (Number.isFinite(override)) return override;
  return quotes[key]?.divine ?? 0;
}

/** Total of the effective prices for a set of item keys. */
export function sumPrices(
  prices: Record<string, string>,
  quotes: Record<string, ItemQuote>,
  keys: string[],
): number {
  return keys.reduce((total, key) => total + effectivePrice(prices, quotes, key), 0);
}
