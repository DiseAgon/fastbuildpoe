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
import { clampRollPercent, DEFAULT_ROLL_PERCENT } from "@/lib/trade/roll";

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
  /** Minimum roll to match, as a percentage of the item's own roll. */
  roll: number;
  setRoll: (roll: number) => void;
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

/** Debounce for the re-seed request, so a slider drag is one call not twenty. */
const RESEED_DELAY_MS = 250;

/**
 * Keep the user's per-mod choices across a re-seed, taking only the roll-derived
 * values from the fresh response. Matched by position and text: the server emits
 * one filter per matched mod in mod order, so for an unchanged item the two
 * lists line up, and the text check stops a shifted list from copying a choice
 * onto the wrong mod.
 */
function carryOverFilters(
  prev: EditableFilter[],
  next: EditableFilter[],
): EditableFilter[] {
  return next.map((f, i) => {
    const old = prev[i];
    return old && old.text === f.text
      ? { ...f, group: old.group, fractured: old.fractured }
      : f;
  });
}

/** Same idea for the equipment and pseudo rows, which only carry a checkbox. */
function carryOverInclude<T extends { include: boolean }, K extends keyof T>(
  prev: T[],
  next: T[],
  key: K,
): T[] {
  const before = new Map(prev.map((row) => [row[key], row.include]));
  return next.map((row) => (before.has(row[key]) ? { ...row, include: before.get(row[key])! } : row));
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
  const [roll, setRollState] = useState<number>(DEFAULT_ROLL_PERCENT);
  const [sel, setSel] = useState<TradeSelection>(EMPTY);
  const [data, setData] = useState<TradeLinkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last non-off group per filter index, so re-checking restores intent. */
  const lastGroup = useRef<Map<number, FilterGroup>>(new Map());
  /** Distinguishes "the roll moved" from "a different item" on a re-seed. */
  const itemRef = useRef(item);

  const fetchLink = useCallback(
    async (payload: Partial<TradeSelection>): Promise<TradeLinkData | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/trade/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game, roll, league: league ?? undefined, item, ...payload }),
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
    [game, roll, league, item],
  );

  const setRoll = useCallback((next: number) => setRollState(clampRollPercent(next)), []);

  /**
   * Re-seed from the server when the item, game, league or roll changes.
   *
   * Debounced because the roll is a slider now: dragging it used to mean one
   * request per step. Which mods are in the search, and which pools they count
   * toward, are carried across a roll change — only the values the roll actually
   * determines (mins and maxes) are replaced. Moving the slider must not quietly
   * undo the mods the user switched off, which is what a full reset did back
   * when this only ran on a rare preset click.
   */
  useEffect(() => {
    let cancelled = false;
    const sameItem = itemRef.current === item;
    itemRef.current = item;
    const asked = { buyout: sel.buyout, useBase: sel.useBase };

    const timer = setTimeout(() => {
      void fetchLink(asked).then((d) => {
        if (cancelled || !d) return;
        if (!sameItem) lastGroup.current = new Map();
        setSel((prev) => ({
          filters: sameItem ? carryOverFilters(prev.filters, d.filters) : d.filters,
          bandMins: sameItem ? prev.bandMins : {},
          equipment: sameItem ? carryOverInclude(prev.equipment, d.equipment, "field") : d.equipment,
          pseudo: sameItem ? carryOverInclude(prev.pseudo, d.pseudo, "statId") : d.pseudo,
          // Fall back to what we asked for; the response may omit these.
          buyout: d.buyout ?? asked.buyout,
          useBase: d.useBase ?? asked.useBase,
        }));
        setData(d);
      });
    }, RESEED_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, league, roll, item]);

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
    roll,
    setRoll,
    sel,
    update,
    toggleFilter,
    data,
    loading,
    error,
    filterIndexByMod: mapModsToFilters(item.mods, sel.filters),
  };
}
