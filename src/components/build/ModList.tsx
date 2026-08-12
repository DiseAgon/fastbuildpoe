"use client";

import type { ParsedItem } from "@/types/item";
import { MOD_TYPE_CLASS, MOD_TYPE_LABEL } from "@/lib/rarity";
import type { TradeSelectionState } from "@/hooks/useTradeSelection";

/**
 * The item's mods and their current search state. Editing lives in the focused
 * trade-search dialog so base scope, properties, pseudo replacements and raw
 * modifiers are visible together rather than split across two surfaces.
 *
 * "No stat" is a verdict, so it waits for one. Until the first response lands
 * there are no filters to line up against and every row qualified, which made
 * the whole list flash a definite negative while it was still loading.
 */
export function ModList({
  item,
  trade,
}: {
  item: ParsedItem;
  trade: TradeSelectionState;
}) {
  const { sel, filterIndexByMod, data } = trade;
  /** The server has answered, so an unmatched mod really has no trade stat. */
  const answered = data !== null;

  if (item.mods.length === 0) {
    return <p className="flex-1 px-4 py-3 text-sm text-muted">No mods parsed.</p>;
  }

  return (
    <ul className="flex-1 space-y-0.5 px-4 py-3 text-sm">
      {item.mods.map((mod, i) => {
        const fi = filterIndexByMod[i];
        const filter = fi >= 0 ? sel.filters[fi] : undefined;
        const searchable = filter !== undefined;
        const included = searchable && filter.group !== "off";
        return (
          <li key={i}>
            <div
              className="flex items-start gap-2 rounded px-1 py-0.5"
              title={
                searchable
                  ? included
                    ? "Included in the trade search"
                    : "Ignored in the trade search — edit in Configure trade search"
                  : answered
                    ? "No trade stat matches this line, so it can't be searched"
                    : "Building the trade search…"
              }
            >
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${included ? "bg-accent" : "bg-border"}`} aria-hidden />
              <span
                className={`mt-0.5 shrink-0 text-[10px] uppercase tracking-wide ${MOD_TYPE_CLASS[mod.type]}`}
              >
                {MOD_TYPE_LABEL[mod.type].slice(0, 3)}
              </span>
              <span
                className={
                  !searchable
                    ? "text-muted/60"
                    : included
                      ? "text-text/90"
                      : "text-muted/50 line-through"
                }
              >
                {mod.text}
              </span>
              {searchable && included && filter.group === "not" && (
                <span className="ml-auto shrink-0 text-[10px] uppercase text-danger">excl</span>
              )}
              {!searchable && answered && (
                <span className="ml-auto shrink-0 text-[10px] uppercase text-muted/50">
                  no stat
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
