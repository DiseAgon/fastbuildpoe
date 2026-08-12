"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ParsedItem } from "@/types/item";
import type {
  BandInfo,
  BaseScope,
  EditableFilter,
  EquipmentFilter,
  FilterGroup,
  PseudoFilter,
  StatBand,
} from "@/lib/trade/queryBuilder";
import type { SocketOptions } from "@/lib/trade/socketOptions";
import { clampRollPercent, DEFAULT_ROLL_PERCENT } from "@/lib/trade/roll";
import { pseudoCoversFilter } from "@/lib/trade/pseudo";
import {
  loadTradeSelection,
  saveTradeSelection,
  type SessionTradeSelection,
} from "@/lib/trade/selectionSession";

export interface TradeSelection extends SessionTradeSelection {
  /** Per-band "match any N" overrides; absent bands use the mode's default. */
  bandMins: Partial<Record<StatBand, number>>;
}

/**
 * The link response. Several selection fields are echoed back only sometimes —
 * `buyout` in particular is never returned — so they are optional here and the
 * caller falls back to what it asked for. Trusting them blindly put `undefined`
 * into a checkbox's `checked` and flipped it from controlled to uncontrolled.
 */
export interface TradeLinkData extends Omit<TradeSelection, "buyout" | "baseScope" | "socket" | "bandMins"> {
  url: string;
  league: string;
  matched: number;
  unmatched: number;
  strategy: string;
  /** Pools present on this item with their resolved thresholds. */
  bands: BandInfo[];
  buyout?: boolean;
  baseScope?: BaseScope;
  socket?: SocketOptions;
}

export interface TradeSelectionState {
  /** Minimum roll to match, as a percentage of the item's own roll. */
  roll: number;
  setRoll: (roll: number) => void;
  sel: TradeSelection;
  update: (patch: Partial<TradeSelection>) => void;
  /** Select a pseudo as a replacement, switching covered source mods off. */
  togglePseudo: (index: number, include: boolean) => void;
  data: TradeLinkData | null;
  loading: boolean;
  error: string | null;
  /** filterIndexByMod[i] is the filter for item.mods[i], or -1 when unmatched. */
  filterIndexByMod: number[];
}

function emptySelection(item: ParsedItem): TradeSelection {
  return {
    filters: [],
    bandMins: {},
    equipment: [],
    pseudo: [],
    buyout: true,
    baseScope: item.rarity === "unique" ? "any" : "exact",
    socket: { links: null, sockets: null, runeSockets: null },
  };
}

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
  let mi = 0;
  while (mi < mods.length && fi < filters.length) {
    const filter = filters[fi];
    if (mods[mi].text !== filter.text) {
      mi++;
      continue;
    }
    out[mi] = fi;
    mi++;
    for (const continuation of filter.continuations ?? []) {
      if (mi >= mods.length || mods[mi].text !== continuation) break;
      out[mi] = fi;
      mi++;
    }
    fi++;
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
 * Owns the complete trade-search selection for one item and the debounced
 * rebuild of its official-trade URL.
 */
export function useTradeSelection(
  game: GameId,
  league: string | null,
  item: ParsedItem,
): TradeSelectionState {
  const [roll, setRollState] = useState<number>(DEFAULT_ROLL_PERCENT);
  const [sel, setSel] = useState<TradeSelection>(() => emptySelection(item));
  const [data, setData] = useState<TradeLinkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequence = useRef(0);
  /** Original raw-mod groups hidden by an active pseudo replacement. */
  const pseudoSourceGroups = useRef<Map<string, FilterGroup>>(new Map());
  /** Distinguishes "the roll moved" from "a different item" on a re-seed. */
  const itemRef = useRef<ParsedItem | null>(null);

  const persist = useCallback(
    (nextRoll: number, nextSelection: TradeSelection) => {
      saveTradeSelection(game, item, nextRoll, nextSelection, pseudoSourceGroups.current);
    },
    [game, item],
  );

  const fetchLink = useCallback(
    async (payload: Partial<TradeSelection>): Promise<TradeLinkData | null> => {
      const sequence = ++requestSequence.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/trade/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game, roll, league: league ?? undefined, item, ...payload }),
        });
        const json = await res.json();
        if (sequence !== requestSequence.current) return null;
        if (json.success && json.data) return json.data as TradeLinkData;
        setError(json.error ?? "Failed to build link.");
        return null;
      } catch {
        if (sequence === requestSequence.current) {
          setError("Could not reach the server.");
        }
        return null;
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [game, roll, league, item],
  );

  const setRoll = useCallback(
    (next: number) => {
      const clamped = clampRollPercent(next);
      setRollState(clamped);
      persist(clamped, sel);
    },
    [persist, sel],
  );

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
    const defaults = emptySelection(item);
    const stored = sameItem ? null : loadTradeSelection(game, item);
    if (!sameItem) {
      setData(null);
      pseudoSourceGroups.current = new Map(Object.entries(stored?.replacementGroups ?? {}));
      const targetRoll = clampRollPercent(stored?.roll ?? DEFAULT_ROLL_PERCENT);
      if (targetRoll !== roll) {
        setSel(stored?.selection ?? defaults);
        setRollState(targetRoll);
        return () => {
          cancelled = true;
          requestSequence.current += 1;
        };
      }
    }
    const restoredSelection = stored?.selection;
    const asked: Partial<TradeSelection> = restoredSelection ?? (sameItem
      ? { buyout: sel.buyout, baseScope: sel.baseScope, socket: sel.socket }
      : { buyout: defaults.buyout, baseScope: defaults.baseScope, socket: defaults.socket });

    const timer = setTimeout(() => {
      void fetchLink(asked).then((d) => {
        if (cancelled || !d) return;
        const preserve = sameItem || !!restoredSelection;
        const next: TradeSelection = {
          filters: sameItem ? carryOverFilters(sel.filters, d.filters) : d.filters,
          bandMins: preserve ? (restoredSelection?.bandMins ?? sel.bandMins) : {},
          equipment: sameItem ? carryOverInclude(sel.equipment, d.equipment, "field") : d.equipment,
          pseudo: sameItem ? carryOverInclude(sel.pseudo, d.pseudo, "statId") : d.pseudo,
          // Fall back to what we asked for; the response may omit these.
          buyout: d.buyout ?? asked.buyout ?? true,
          baseScope: d.baseScope ?? asked.baseScope ?? defaults.baseScope,
          socket: d.socket ?? asked.socket ?? defaults.socket,
        };
        setSel(next);
        persist(roll, next);
        if (!sameItem) {
          setData(d);
          return;
        }
        // The seed carries fresh roll-derived minimums. Rebuild once with the
        // user's preserved choices so the URL and visible controls agree.
        void fetchLink(next).then((rebuilt) => {
          if (cancelled || !rebuilt) return;
          setData(rebuilt);
          const canonical: TradeSelection = {
            ...next,
            filters: rebuilt.filters,
            equipment: rebuilt.equipment,
            pseudo: rebuilt.pseudo,
            baseScope: rebuilt.baseScope ?? next.baseScope,
            socket: rebuilt.socket ?? next.socket,
          };
          setSel(canonical);
          persist(roll, canonical);
        });
      });
    }, RESEED_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (debounce.current) {
        clearTimeout(debounce.current);
        debounce.current = null;
      }
      // Ignore any response that belongs to the previous item/roll/league.
      requestSequence.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, league, roll, item]);

  const update = useCallback(
    (patch: Partial<TradeSelection>) => {
      const next = { ...sel, ...patch };
      setSel(next);
      persist(roll, next);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        void fetchLink(next).then((d) => {
          if (!d) return;
          setData(d);
          const canonical: TradeSelection = {
            ...next,
            filters: d.filters,
            equipment: d.equipment,
            pseudo: d.pseudo,
            baseScope: d.baseScope ?? next.baseScope,
            socket: d.socket ?? next.socket,
          };
          setSel(canonical);
          persist(roll, canonical);
        });
      }, 300);
    },
    [fetchLink, persist, roll, sel],
  );

  const togglePseudo = useCallback(
    (index: number, include: boolean) => {
      const target = sel.pseudo[index];
      if (!target) return;
      const previouslyActive = sel.pseudo.filter((row) => row.include);
      const pseudo = sel.pseudo.map((row, i) => ({
        ...row,
        include:
          i === index
            ? include
            : include && target.family && row.family === target.family
              ? false
              : row.include,
      }));
      const newlyActive = pseudo.filter((row) => row.include);
      const filters = sel.filters.map((filter, filterIndex) => {
        const wasCovered = previouslyActive.some((row) =>
          pseudoCoversFilter(row.statId, filter.statId),
        );
        const isCovered = newlyActive.some((row) =>
          pseudoCoversFilter(row.statId, filter.statId),
        );
        const key = `${filterIndex}\0${filter.statId}\0${filter.text}`;
        if (isCovered) {
          if (filter.group !== "off" && !pseudoSourceGroups.current.has(key)) {
            pseudoSourceGroups.current.set(key, filter.group);
          }
          return { ...filter, group: "off" as const };
        }
        if (wasCovered) {
          const original = pseudoSourceGroups.current.get(key);
          pseudoSourceGroups.current.delete(key);
          if (original) return { ...filter, group: original };
        }
        return filter;
      });
      const next = { ...sel, pseudo, filters };
      setSel(next);
      persist(roll, next);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        void fetchLink(next).then((d) => {
          if (!d) return;
          setData(d);
          const canonical: TradeSelection = {
            ...next,
            filters: d.filters,
            pseudo: d.pseudo,
          };
          setSel(canonical);
          persist(roll, canonical);
        });
      }, 300);
    },
    [fetchLink, persist, roll, sel],
  );

  return {
    roll,
    setRoll,
    sel,
    update,
    togglePseudo,
    data,
    loading,
    error,
    filterIndexByMod: mapModsToFilters(item.mods, sel.filters),
  };
}
