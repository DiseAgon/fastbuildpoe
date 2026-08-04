"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import type {
  BandInfo,
  EditableFilter,
  EquipmentFilter,
  FilterGroup,
  PseudoFilter,
  StatBand,
} from "@/lib/trade/queryBuilder";

export type BudgetMode = "minmax" | "asis" | "budget";

export interface TradeSelection {
  filters: EditableFilter[];
  /** Per-band "match any N" overrides; absent bands use the mode's default. */
  bandMins: Partial<Record<StatBand, number>>;
  equipment: EquipmentFilter[];
  pseudo: PseudoFilter[];
  buyout: boolean;
  useBase: boolean;
}

/**
 * The link response. Several selection fields are echoed back only sometimes —
 * `buyout` in particular is never returned — so they are optional here and the
 * caller falls back to what it asked for. Trusting them blindly put `undefined`
 * into a checkbox's `checked` and flipped it from controlled to uncontrolled.
 */
export interface TradeLinkData extends Omit<TradeSelection, "buyout" | "useBase" | "bandMins"> {
  url: string;
  league: string;
  matched: number;
  unmatched: number;
  strategy: string;
  /** Pools present on this item with their resolved thresholds. */
  bands: BandInfo[];
  buyout?: boolean;
  useBase?: boolean;
}

export interface TradeSelectionState {
  mode: BudgetMode;
  setMode: (mode: BudgetMode) => void;
  sel: TradeSelection;
  update: (patch: Partial<TradeSelection>) => void;
  /** Toggle one mod in or out of the search, restoring its previous group. */
  toggleFilter: (index: number, include: boolean) => void;
  data: TradeLinkData | null;
  loading: boolean;
  error: string | null;
  /** filterIndexByMod[i] is the filter for item.mods[i], or -1 when unmatched. */
  filterIndexByMod: number[];
}

const EMPTY: TradeSelection = {
  filters: [],
  bandMins: {},
  equipment: [],
  pseudo: [],
  buyout: true,
  useBase: true,
};

/**
 * Line up displayed mods with the filters built from them.
 *
 * The server creates one filter per mod it can match, in mod order, skipping
 * the ones with no trade stat — so filters are a subsequence of mods. Walking
 * both in order (rather than looking up by text) keeps duplicate mod lines on an
 * item mapped to distinct filters.
 */
function mapModsToFilters(mods: ParsedItem["mods"], filters: EditableFilter[]): number[] {
  const out = new Array<number>(mods.length).fill(-1);
  let fi = 0;
  for (let mi = 0; mi < mods.length && fi < filters.length; mi++) {
    if (mods[mi].text === filters[fi].text) {
      out[mi] = fi;
      fi++;
    }
  }
  return out;
}

/**
 * Owns the trade-search selection for one item: the mode, the per-mod filters,
 * and the debounced rebuild of the trade URL.
 *
 * Lifted out of the trade controls so the item's mod list can render a checkbox
 * per mod against the same state — picking mods is the common case and belongs
 * next to the mods, not behind a panel.
 */
export function useTradeSelection(
  game: GameId,
  league: string | null,
  item: ParsedItem,
): TradeSelectionState {
  const [mode, setMode] = useState<BudgetMode>("asis");
  const [sel, setSel] = useState<TradeSelection>(EMPTY);
  const [data, setData] = useState<TradeLinkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last non-off group per filter index, so re-checking restores intent. */
  const lastGroup = useRef<Map<number, FilterGroup>>(new Map());

  const fetchLink = useCallback(
    async (payload: Partial<TradeSelection>): Promise<TradeLinkData | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/trade/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game, mode, league: league ?? undefined, item, ...payload }),
        });
        const json = await res.json();
        if (json.success && json.data) return json.data as TradeLinkData;
        setError(json.error ?? "Failed to build link.");
        return null;
      } catch {
        setError("Could not reach the server.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [game, mode, league, item],
  );

  // Re-seed defaults when game/league/mode/item changes (keeps buyout/useBase).
  useEffect(() => {
    let cancelled = false;
    const asked = { buyout: sel.buyout, useBase: sel.useBase };
    fetchLink(asked).then((d) => {
      if (cancelled || !d) return;
      lastGroup.current = new Map();
      setSel({
        filters: d.filters,
        // Re-seeded from the server's defaults, so switching mode or item drops
        // thresholds tuned for the previous one rather than carrying them over.
        bandMins: {},
        equipment: d.equipment,
        pseudo: d.pseudo,
        // Fall back to what we asked for; the response may omit these.
        buyout: d.buyout ?? asked.buyout,
        useBase: d.useBase ?? asked.useBase,
      });
      setData(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, league, mode, item]);

  const update = useCallback(
    (patch: Partial<TradeSelection>) => {
      setSel((prev) => {
        const next = { ...prev, ...patch };
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
          void fetchLink(next).then((d) => {
            if (d) setData(d);
          });
        }, 300);
        return next;
      });
    },
    [fetchLink],
  );

  const toggleFilter = useCallback(
    (index: number, include: boolean) => {
      setSel((prev) => {
        const current = prev.filters[index];
        if (!current) return prev;
        if (!include && current.group !== "off") lastGroup.current.set(index, current.group);
        const group: FilterGroup = include
          ? (lastGroup.current.get(index) ?? "and")
          : "off";
        const filters = prev.filters.map((f, i) => (i === index ? { ...f, group } : f));
        const next = { ...prev, filters };
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
          void fetchLink(next).then((d) => {
            if (d) setData(d);
          });
        }, 300);
        return next;
      });
    },
    [fetchLink],
  );

  return {
    mode,
    setMode,
    sel,
    update,
    toggleFilter,
    data,
    loading,
    error,
    filterIndexByMod: mapModsToFilters(item.mods, sel.filters),
  };
}
