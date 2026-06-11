"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";

interface BuildContextValue {
  game: GameId;
  league: string | null;
  divineIcon: string | null;
  getPrice: (key: string) => string;
  setPrice: (key: string, value: string) => void;
  keyFor: (item: ParsedItem) => string;
  /** Sum of the manually-entered prices for the given items (blank/invalid = 0). */
  sumItems: (items: ParsedItem[]) => number;
}

const BuildContext = createContext<BuildContextValue | null>(null);

export function BuildProvider({
  game,
  league,
  divineIcon,
  prices,
  onPriceChange,
  children,
}: {
  game: GameId;
  league: string | null;
  divineIcon: string | null;
  /** Price-by-key map, owned by the page (so it can be restored from a share link). */
  prices: Record<string, string>;
  onPriceChange: (key: string, value: string) => void;
  children: ReactNode;
}) {
  const keyFor = useCallback(
    (item: ParsedItem) =>
      item.category === "gem"
        ? `${game}|gem|${item.name}|${item.gemLevel ?? ""}|${item.quality ?? ""}`
        : `${game}|${item.category}|${item.name}|${item.baseType}|${item.slot ?? ""}`,
    [game],
  );

  const getPrice = useCallback((key: string) => prices[key] ?? "", [prices]);

  const setPrice = useCallback(
    (key: string, value: string) => onPriceChange(key, value),
    [onPriceChange],
  );

  const sumItems = useCallback(
    (items: ParsedItem[]) =>
      items.reduce((total, item) => {
        const value = Number.parseFloat(prices[keyFor(item)] || "");
        return total + (Number.isFinite(value) ? value : 0);
      }, 0),
    [prices, keyFor],
  );

  return (
    <BuildContext.Provider
      value={{ game, league, divineIcon, getPrice, setPrice, keyFor, sumItems }}
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
