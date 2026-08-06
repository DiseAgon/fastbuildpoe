"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import { itemKey } from "@/lib/build/itemKey";
import { effectivePrice } from "@/lib/build/price";
import type { ItemQuote } from "@/lib/market/buildPrices";

interface BuildContextValue {
  game: GameId;
  league: string | null;
  divineIcon: string | null;
  /** The manual override for a key, or "" when the auto price is in effect. */
  getOverride: (key: string) => string;
  setPrice: (key: string, value: string) => void;
  /** Clear the manual override so the live price takes over again. */
  clearOverride: (key: string) => void;
  /** Live poe.ninja quote for a key, when one was found. */
  getQuote: (key: string) => ItemQuote | undefined;
  /** What the input should show: the override if set, else the live price. */
  getPrice: (key: string) => string;
  keyFor: (item: ParsedItem) => string;
  /** Sum of effective prices (override where set, live price otherwise). */
  sumItems: (items: ParsedItem[]) => number;
  /** Items in the list with neither an override nor a live price. */
  countUnpriced: (items: ParsedItem[]) => number;
  pricesLoading: boolean;
  /** Set when live pricing is unavailable (PoE2, or poe.ninja had no data). */
  pricesUnavailable: string | null;
}

const BuildContext = createContext<BuildContextValue | null>(null);

/** Round to 2dp for display without dragging float noise into the input. */
function formatAuto(divine: number): string {
  if (divine >= 100) return String(Math.round(divine));
  if (divine >= 1) return String(Math.round(divine * 10) / 10);
  return String(Math.round(divine * 100) / 100);
}

export function BuildProvider({
  game,
  league,
  divineIcon,
  prices,
  quotes,
  pricesLoading,
  pricesUnavailable,
  onPriceChange,
  children,
}: {
  game: GameId;
  league: string | null;
  divineIcon: string | null;
  /** Manual overrides only, owned by the page (so a share link can restore them). */
  prices: Record<string, string>;
  /** Live quotes by item key, keyed the same way as `prices`. */
  quotes: Record<string, ItemQuote>;
  pricesLoading: boolean;
  pricesUnavailable: string | null;
  onPriceChange: (key: string, value: string) => void;
  children: ReactNode;
}) {
  const keyFor = useCallback((item: ParsedItem) => itemKey(game, item), [game]);

  const getOverride = useCallback((key: string) => prices[key] ?? "", [prices]);
  const getQuote = useCallback((key: string) => quotes[key], [quotes]);

  /** Effective numeric price: override wins, else the live quote. */
  const effective = useCallback(
    (key: string): number => effectivePrice(prices, quotes, key),
    [prices, quotes],
  );

  const getPrice = useCallback(
    (key: string) => {
      const override = prices[key];
      if (override !== undefined && override !== "") return override;
      const divine = quotes[key]?.divine;
      return divine !== null && divine !== undefined ? formatAuto(divine) : "";
    },
    [prices, quotes],
  );

  const setPrice = useCallback(
    (key: string, value: string) => onPriceChange(key, value),
    [onPriceChange],
  );

  const clearOverride = useCallback((key: string) => onPriceChange(key, ""), [onPriceChange]);

  const sumItems = useCallback(
    (items: ParsedItem[]) =>
      items.reduce((total, item) => total + effective(keyFor(item)), 0),
    [effective, keyFor],
  );

  const countUnpriced = useCallback(
    (items: ParsedItem[]) =>
      items.filter((item) => {
        const key = keyFor(item);
        return !Number.isFinite(Number.parseFloat(prices[key] || "")) && !quotes[key]?.divine;
      }).length,
    [prices, quotes, keyFor],
  );

  return (
    <BuildContext.Provider
      value={{
        game,
        league,
        divineIcon,
        getOverride,
        setPrice,
        clearOverride,
        getQuote,
        getPrice,
        keyFor,
        sumItems,
        countUnpriced,
        pricesLoading,
        pricesUnavailable,
      }}
    >
      {children}
    </BuildContext.Provider>
  );
}

export function useBuild(): BuildContextValue {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error("useBuild must be used within a BuildProvider.");
  return ctx;
}

/** Format a divine amount: drop trailing .0, keep one decimal otherwise. */
export function formatDivine(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
