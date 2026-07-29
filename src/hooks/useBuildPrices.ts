"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import type { BuildPriceResult, ItemQuote } from "@/lib/market/buildPrices";
import { itemKey } from "@/lib/build/itemKey";

interface PricesResponse {
  success: boolean;
  data: BuildPriceResult | null;
  error: string | null;
}

export interface BuildPricesState {
  quotes: Record<string, ItemQuote>;
  loading: boolean;
  /** Set when live pricing can't run at all (PoE2, or poe.ninja had no data). */
  unavailable: string | null;
}

const EMPTY: Record<string, ItemQuote> = {};

/**
 * Fetch live poe.ninja quotes for a build's items.
 *
 * Quotes accumulate across item sets: switching from "Budget" to "Endgame"
 * should not drop the prices already fetched, and re-requesting an item we have
 * is wasted work. The request is keyed on the deduped item list so it fires
 * once per genuinely new set of items, and a stale response from a previous
 * league/game is discarded rather than merged.
 */
export function useBuildPrices(
  game: GameId,
  league: string,
  items: ParsedItem[],
): BuildPricesState {
  const [quotes, setQuotes] = useState<Record<string, ItemQuote>>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  // Reset quotes when the economy behind them changes.
  const scope = `${game}|${league}`;
  const scopeRef = useRef(scope);

  const payload = useMemo(() => {
    const byKey = new Map<string, ParsedItem>();
    for (const item of items) {
      const key = itemKey(game, item);
      if (!byKey.has(key)) byKey.set(key, item);
    }
    return [...byKey.entries()].map(([key, item]) => ({
      key,
      name: item.name,
      baseType: item.baseType,
      rarity: item.rarity,
      category: item.category,
      gemLevel: item.gemLevel,
      quality: item.quality,
      corrupted: item.corrupted,
    }));
  }, [game, items]);

  // Stringify so the effect re-runs on content change, not array identity.
  const signature = useMemo(() => JSON.stringify(payload), [payload]);

  useEffect(() => {
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      setQuotes(EMPTY);
      setUnavailable(null);
    }
    if (!league || payload.length === 0) return;

    let cancelled = false;
    setLoading(true);
    fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game, league, items: payload }),
    })
      .then((res) => res.json())
      .then((json: PricesResponse) => {
        if (cancelled || scopeRef.current !== scope) return;
        if (!json.success || !json.data) {
          setUnavailable(json.error ?? "Could not load live prices.");
          return;
        }
        if (!json.data.supported) {
          setUnavailable(json.data.reason ?? "Live pricing is unavailable.");
          return;
        }
        setUnavailable(null);
        setQuotes((prev) => {
          const next = { ...prev };
          for (const quote of json.data!.quotes) next[quote.key] = quote;
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setUnavailable("Could not reach the price service.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `signature` stands in for `payload`'s contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, league, scope, signature]);

  return { quotes, loading, unavailable };
}
