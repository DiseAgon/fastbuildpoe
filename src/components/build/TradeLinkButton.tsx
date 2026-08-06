"use client";

import { useState } from "react";
import type { ParsedItem } from "@/types/item";
import type { FilterGroup } from "@/lib/trade/queryBuilder";
import type { TradeSelectionState } from "@/hooks/useTradeSelection";
import {
  MAX_ROLL_PERCENT,
  MIN_ROLL_PERCENT,
  ROLL_PERCENT_STEP,
} from "@/lib/trade/roll";

/** Plain-language read-out for where the slider is sitting. */
function rollHint(roll: number): string {
  if (roll >= 100) return "as good as this item";
  if (roll <= 0) return "any roll";
  return `${roll}% of this item's rolls`;
}

const GROUPS: { id: FilterGroup; label: string; hint: string }[] = [
  { id: "and", label: "Must", hint: "Required (AND)" },
  { id: "count", label: "Any", hint: "Optional — counts toward 'any N of'" },
  { id: "not", label: "Excl", hint: "Item must NOT have this" },
  { id: "off", label: "Off", hint: "Ignore this mod" },
];

/**
 * Trade-search controls for one item.
 *
 * Which mods to search is chosen on the mod list itself (see ModList); this is
 * the rest: strictness preset, buy-out/base toggles, and an advanced panel for
 * roll ranges, Must/Any/Excl grouping and pseudo totals. Selection state is
 * owned by useTradeSelection so both surfaces stay in sync.
 */
export function TradeLinkButton({
  item,
  trade,
}: {
  item: ParsedItem;
  trade: TradeSelectionState;
}) {
  const { roll, setRoll, sel, update, data, loading, error } = trade;
  const [showPanel, setShowPanel] = useState(false);

  /**
   * Thresholds come from the server, which is the only side that knows which
   * mods survived family and fractured grouping and therefore how big each
   * pool really is. Local edits are held in `sel.bandMins` and win until the
   * next response.
   */
  const bands = data?.bands ?? [];

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          className="flex min-w-[13rem] flex-1 items-center gap-2 text-xs text-muted"
          title="How good a match has to be. Each mod's minimum is set to this share of the roll this item has — 100% asks for an item at least this good, 0% drops the roll floor and searches on the mods alone."
        >
          <span className="shrink-0 text-text">Rolls</span>
          <input
            type="range"
            min={MIN_ROLL_PERCENT}
            max={MAX_ROLL_PERCENT}
            step={ROLL_PERCENT_STEP}
            value={roll}
            onChange={(e) => setRoll(Number(e.target.value))}
            aria-label="Minimum roll, as a percentage of this item's rolls"
            aria-valuetext={`${roll} percent — ${rollHint(roll)}`}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-[color:var(--color-accent)]"
          />
          <span className="w-9 shrink-0 text-right tabular-nums font-medium text-accent">
            {roll}%
          </span>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted" title="Only listings with a fixed buyout price">
            <input
              type="checkbox"
              checked={sel.buyout}
              onChange={(e) => update({ buyout: e.target.checked })}
              className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
            />
            Buy-out
          </label>
          {item.category !== "gem" && (
            <label className="flex items-center gap-1.5 text-xs text-muted" title="Constrain to this item's base type">
              <input
                type="checkbox"
                checked={sel.useBase}
                onChange={(e) => update({ useBase: e.target.checked })}
                className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
              />
              Base
            </label>
          )}
          {(sel.filters.length > 0 || sel.equipment.length > 0 || sel.pseudo.length > 0) && (
            <button
              type="button"
              onClick={() => setShowPanel((v) => !v)}
              aria-expanded={showPanel}
              title="Roll ranges, Must/Any/Exclude grouping, and pseudo totals"
              className={`rounded-[6px] border px-2.5 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
                showPanel
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-accent/50 hover:text-accent"
              }`}
            >
              {showPanel ? "▲ Advanced" : "▾ Advanced"}
            </button>
          )}
        </div>
      </div>

      {showPanel && (
        <div className="flex flex-col gap-1.5 rounded-[6px] border border-border/60 bg-bg/40 p-2">
          {sel.equipment.length > 0 && (
            <>
              <span className="text-[10px] uppercase tracking-wide text-muted">Equipment</span>
              {sel.equipment.map((e, i) => (
                <div key={e.field} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={e.include}
                    onChange={(ev) =>
                      update({
                        equipment: sel.equipment.map((x, j) =>
                          j === i ? { ...x, include: ev.target.checked } : x,
                        ),
                      })
                    }
                    className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
                  />
                  <span className={`flex-1 ${e.include ? "text-text/90" : "text-muted/50"}`}>
                    {e.label} <span className="text-muted">({e.itemValue})</span>
                  </span>
                  <input
                    type="number"
                    value={e.min ?? ""}
                    placeholder="min"
                    onChange={(ev) =>
                      update({
                        equipment: sel.equipment.map((x, j) =>
                          j === i ? { ...x, min: ev.target.value === "" ? null : Number(ev.target.value) } : x,
                        ),
                      })
                    }
                    className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-text"
                  />
                  <input
                    type="number"
                    value={e.max ?? ""}
                    placeholder="max"
                    onChange={(ev) =>
                      update({
                        equipment: sel.equipment.map((x, j) =>
                          j === i ? { ...x, max: ev.target.value === "" ? null : Number(ev.target.value) } : x,
                        ),
                      })
                    }
                    className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-text"
                  />
                </div>
              ))}
            </>
          )}

          {sel.pseudo.length > 0 && (
            <>
              <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                Totals (combine all sources)
              </span>
              {sel.pseudo.map((p, i) => (
                <div key={p.statId} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={p.include}
                    onChange={(ev) =>
                      update({
                        pseudo: sel.pseudo.map((x, j) =>
                          j === i ? { ...x, include: ev.target.checked } : x,
                        ),
                      })
                    }
                    className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
                  />
                  <span className={`flex-1 ${p.include ? "text-rarity-gem" : "text-muted/60"}`}>
                    {p.label} <span className="text-muted">({p.itemValue})</span>
                  </span>
                  <input
                    type="number"
                    value={p.min ?? ""}
                    placeholder="min"
                    onChange={(ev) =>
                      update({
                        pseudo: sel.pseudo.map((x, j) =>
                          j === i ? { ...x, min: ev.target.value === "" ? null : Number(ev.target.value) } : x,
                        ),
                      })
                    }
                    className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-text"
                  />
                  <input
                    type="number"
                    value={p.max ?? ""}
                    placeholder="max"
                    onChange={(ev) =>
                      update({
                        pseudo: sel.pseudo.map((x, j) =>
                          j === i ? { ...x, max: ev.target.value === "" ? null : Number(ev.target.value) } : x,
                        ),
                      })
                    }
                    className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-text"
                  />
                </div>
              ))}
            </>
          )}

          {sel.filters.length > 0 && (sel.equipment.length > 0 || sel.pseudo.length > 0) && (
            <span className="mt-1 text-[10px] uppercase tracking-wide text-muted">Modifiers</span>
          )}

          {bands.length > 0 && (
            <div className="flex flex-col gap-1 pb-1">
              {bands.map((band) => (
                <label key={band.key} className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-14 shrink-0 text-text">{band.label}</span>
                  match any
                  <input
                    type="number"
                    min={1}
                    max={band.total}
                    value={sel.bandMins[band.key] ?? band.min}
                    onChange={(e) =>
                      update({
                        bandMins: {
                          ...sel.bandMins,
                          [band.key]: Math.max(
                            1,
                            Math.min(band.total, Number(e.target.value) || 1),
                          ),
                        },
                      })
                    }
                    className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-text"
                    disabled={band.total < 2}
                  />
                  of {band.total}
                </label>
              ))}
            </div>
          )}
          {sel.filters.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <select
                value={f.group}
                onChange={(e) =>
                  update({
                    filters: sel.filters.map((x, j) =>
                      j === i ? { ...x, group: e.target.value as FilterGroup } : x,
                    ),
                  })
                }
                title="How to match this mod"
                className="rounded border border-border bg-surface px-1 py-0.5 text-text"
              >
                {GROUPS.map((g) => (
                  <option key={g.id} value={g.id} title={g.hint}>
                    {g.label}
                  </option>
                ))}
              </select>
              {f.fracturedStatId && (
                <label
                  className={`flex items-center gap-0.5 ${f.fractured ? "text-rarity-unique" : "text-muted"}`}
                  title="Search the fractured version of this mod"
                >
                  <input
                    type="checkbox"
                    checked={f.fractured}
                    onChange={(e) =>
                      update({
                        filters: sel.filters.map((x, j) =>
                          j === i ? { ...x, fractured: e.target.checked } : x,
                        ),
                      })
                    }
                    className="h-3 w-3 accent-[color:var(--rarity-unique)]"
                  />
                  Frac
                </label>
              )}
              <span
                className={`flex-1 truncate ${f.group === "off" ? "text-muted/50 line-through" : f.fractured ? "text-rarity-unique" : "text-text/90"}`}
                title={f.text}
              >
                {f.text}
              </span>
              <input
                type="number"
                value={f.min ?? ""}
                placeholder="min"
                onChange={(e) =>
                  update({
                    filters: sel.filters.map((x, j) =>
                      j === i ? { ...x, min: e.target.value === "" ? null : Number(e.target.value) } : x,
                    ),
                  })
                }
                className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-text"
              />
              <input
                type="number"
                value={f.max ?? ""}
                placeholder="max"
                onChange={(e) =>
                  update({
                    filters: sel.filters.map((x, j) =>
                      j === i ? { ...x, max: e.target.value === "" ? null : Number(e.target.value) } : x,
                    ),
                  })
                }
                className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-text"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {data ? (
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors duration-[var(--duration-fast)] hover:bg-accent/20"
          >
            Open trade search ↗
          </a>
        ) : (
          <span className="text-sm text-muted">{loading ? "Building link…" : "—"}</span>
        )}
        {data && (
          <span className="text-right text-xs text-muted">
            {data.strategy}
            {data.unmatched > 0 ? (
              <>
                <br />
                {data.unmatched} mod(s) unmatched
              </>
            ) : null}
          </span>
        )}
      </div>

      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
