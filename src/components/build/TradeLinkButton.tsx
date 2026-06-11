"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedItem } from "@/types/item";
import type {
  EditableFilter,
  EquipmentFilter,
  FilterGroup,
  PseudoFilter,
} from "@/lib/trade/queryBuilder";
import { useBuild } from "./BuildContext";

type BudgetMode = "minmax" | "asis" | "budget";

const MODES: { id: BudgetMode; label: string; hint: string }[] = [
  { id: "minmax", label: "Min-max", hint: "All mods required, best rolls" },
  { id: "asis", label: "As-is", hint: "Match most mods (similar item)" },
  { id: "budget", label: "Budget", hint: "Match fewer mods, cheaper" },
];

const GROUPS: { id: FilterGroup; label: string; hint: string }[] = [
  { id: "and", label: "Must", hint: "Required (AND)" },
  { id: "count", label: "Any", hint: "Optional — counts toward 'any N of'" },
  { id: "not", label: "Excl", hint: "Item must NOT have this" },
  { id: "off", label: "Off", hint: "Ignore this mod" },
];

interface Selection {
  filters: EditableFilter[];
  countMin: number;
  equipment: EquipmentFilter[];
  pseudo: PseudoFilter[];
  buyout: boolean;
  useBase: boolean;
}

interface LinkData extends Selection {
  url: string;
  league: string;
  matched: number;
  unmatched: number;
  strategy: string;
}

export function TradeLinkButton({ item }: { item: ParsedItem }) {
  const { game, league } = useBuild();
  const [mode, setMode] = useState<BudgetMode>("asis");
  const [sel, setSel] = useState<Selection>({
    filters: [],
    countMin: 1,
    equipment: [],
    pseudo: [],
    buyout: true,
    useBase: true,
  });
  const [data, setData] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchLink(payload: Partial<Selection>): Promise<LinkData | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trade/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game, mode, league: league ?? undefined, item, ...payload }),
      });
      const json = await res.json();
      if (json.success && json.data) return json.data as LinkData;
      setError(json.error ?? "Failed to build link.");
      return null;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Re-seed defaults whenever game/league/mode/item changes (keeps buyout/useBase).
  useEffect(() => {
    let cancelled = false;
    fetchLink({ buyout: sel.buyout, useBase: sel.useBase }).then((d) => {
      if (cancelled || !d) return;
      setSel({
        filters: d.filters,
        countMin: d.countMin,
        equipment: d.equipment,
        pseudo: d.pseudo,
        buyout: d.buyout,
        useBase: d.useBase,
      });
      setData(d);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, league, mode, item]);

  /** Apply a partial change to the selection and rebuild the link (debounced). */
  function update(patch: Partial<Selection>) {
    const next = { ...sel, ...patch };
    setSel(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      fetchLink(next).then((d) => {
        if (d) setData(d);
      });
    }, 300);
  }

  const countTotal = sel.filters.filter((f) => f.group === "count").length;

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Search strictness">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              title={m.hint}
              className={`rounded-[6px] px-2.5 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
                mode === m.id ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
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
              className={`flex items-center gap-1 rounded-[6px] border px-2.5 py-1 text-xs font-semibold transition-colors duration-[var(--duration-fast)] ${
                showPanel
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
              }`}
            >
              {showPanel ? "▲ Hide mods" : "⚙ Customize mods"}
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

          {countTotal >= 2 && (
            <label className="flex items-center gap-2 pb-1 text-xs text-muted">
              Match any
              <input
                type="number"
                min={1}
                max={countTotal}
                value={sel.countMin}
                onChange={(e) =>
                  update({ countMin: Math.max(1, Math.min(countTotal, Number(e.target.value) || 1)) })
                }
                className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-text"
              />
              of {countTotal} optional
            </label>
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
              <span
                className={`flex-1 truncate ${f.group === "off" ? "text-muted/50 line-through" : "text-text/90"}`}
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
        <span className="text-xs text-red-400" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
