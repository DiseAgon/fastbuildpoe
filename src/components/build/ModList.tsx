"use client";

import type { ParsedItem } from "@/types/item";
import { MOD_TYPE_CLASS, MOD_TYPE_LABEL } from "@/lib/rarity";
import type { TradeSelectionState } from "@/hooks/useTradeSelection";

/**
 * The item's mods, each with a checkbox for "include this in the trade search".
 *
 * Picking which mods to match is the main thing people adjust, so it lives here
 * on the mods themselves rather than behind the advanced panel. A mod with no
 * trade stat (PoB text the stat index can't match) shows a disabled box and says
 * so — silently rendering it as unchecked would look like a choice we made.
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
  const { sel, toggleFilter, filterIndexByMod, data } = trade;
  const ready = sel.filters.length > 0;
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
        const id = `mod-${item.name}-${i}`.replace(/[^a-zA-Z0-9_-]/g, "-");

        return (
          <li key={i}>
            <label
              htmlFor={id}
              className={`flex items-start gap-2 rounded px-1 py-0.5 transition-colors ${
                searchable ? "cursor-pointer hover:bg-surface-raised" : "cursor-default"
              }`}
              title={
                searchable
                  ? included
                    ? "Included in the trade search — uncheck to ignore"
                    : "Ignored — check to require it"
                  : answered
                    ? "No trade stat matches this line, so it can't be searched"
                    : "Building the trade search…"
              }
            >
              <input
                id={id}
                type="checkbox"
                checked={included}
                disabled={!searchable || !ready}
                onChange={(e) => searchable && toggleFilter(fi, e.target.checked)}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-[color:var(--color-accent)] disabled:opacity-30"
              />
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
            </label>
          </li>
        );
      })}
    </ul>
  );
}
