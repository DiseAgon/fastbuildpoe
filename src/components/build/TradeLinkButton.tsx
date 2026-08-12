"use client";

import { useState } from "react";
import type { ParsedItem } from "@/types/item";
import type { BaseScope, FilterGroup } from "@/lib/trade/queryBuilder";
import { itemSocketCounts } from "@/lib/trade/socketOptions";
import type { TradeSelectionState } from "@/hooks/useTradeSelection";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { useBuild } from "./BuildContext";
import {
  MAX_ROLL_PERCENT,
  MIN_ROLL_PERCENT,
  ROLL_PERCENT_STEP,
} from "@/lib/trade/roll";

function rollHint(roll: number): string {
  if (roll > 100) return `${roll - 100}% better than this item`;
  if (roll === 100) return "as good as this item";
  if (roll <= 0) return "any roll";
  return `${roll}% of this item's rolls`;
}

const PRESETS = [
  { value: 70, label: "Budget" },
  { value: 80, label: "Similar" },
  { value: 100, label: "Exact" },
  { value: 110, label: "Upgrade" },
] as const;

const GROUPS: { id: FilterGroup; label: string }[] = [
  { id: "and", label: "Must" },
  { id: "count", label: "Any" },
  { id: "not", label: "Exclude" },
  { id: "off", label: "Off" },
];

const BASE_SCOPES: Array<{ id: BaseScope; label: string; hint: string }> = [
  { id: "exact", label: "Exact base", hint: "Only this base type" },
  { id: "slot", label: "Same slot / class", hint: "Broader base, keep defence or DPS properties" },
  { id: "any", label: "Any item", hint: "No base or slot restriction" },
];

/**
 * The item card stays readable; all decisions that shape the query live in one
 * focused dialog. Pseudo rows say “Replace” because they remove their covered
 * raw modifiers instead of stacking more constraints onto the search.
 */
export function TradeLinkButton({
  item,
  trade,
}: {
  item: ParsedItem;
  trade: TradeSelectionState;
}) {
  const { game } = useBuild();
  const { roll, setRoll, sel, update, togglePseudo, data, loading, error } = trade;
  const [open, setOpen] = useState(false);
  useEscapeClose(open, () => setOpen(false));
  const bands = data?.bands ?? [];
  const socketCounts = itemSocketCounts(item.sockets);
  const displayName = item.name === "New Item" ? item.baseType : item.name;

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent/60 hover:text-accent"
        >
          Configure trade search
        </button>
        {data ? (
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Open trade search ↗
          </a>
        ) : (
          <span className="text-sm text-muted">{loading ? "Building link…" : "—"}</span>
        )}
      </div>

      {data && (
        <span className="text-xs text-muted">
          {data.strategy}
          {data.unmatched > 0 ? ` · ${data.unmatched} unmatched` : ""}
        </span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Trade search for ${displayName}`}>
          <button
            type="button"
            aria-label="Close trade search settings"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <section className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface shadow-card">
            <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Trade search</p>
                <h3 className="truncate font-serif text-xl text-text">{displayName}</h3>
                <p className="truncate text-xs text-muted">{item.baseType}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-xl text-muted hover:text-text" aria-label="Close">×</button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <section className="space-y-2" aria-label="Search strictness">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Minimum rolls</h4>
                  <span className="text-xs font-medium text-accent">{roll}% · {rollHint(roll)}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setRoll(preset.value)}
                      aria-pressed={roll === preset.value}
                      className={`rounded-md border px-2 py-1.5 text-xs ${roll === preset.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text"}`}
                    >
                      {preset.label} <span className="tabular-nums">{preset.value}%</span>
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={MIN_ROLL_PERCENT}
                  max={MAX_ROLL_PERCENT}
                  step={ROLL_PERCENT_STEP}
                  value={roll}
                  onChange={(event) => setRoll(Number(event.target.value))}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-[color:var(--color-accent)]"
                  aria-label="Minimum roll percentage"
                />
              </section>

              <section className="space-y-2" aria-label="Search scope">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Search by</h4>
                <div className="grid gap-2 sm:grid-cols-3">
                  {BASE_SCOPES.map((scope) => (
                    <label key={scope.id} className={`cursor-pointer rounded-md border p-2 ${sel.baseScope === scope.id ? "border-accent bg-accent/10" : "border-border"}`}>
                      <span className="flex items-center gap-2 text-sm text-text">
                        <input type="radio" name="base-scope" checked={sel.baseScope === scope.id} onChange={() => update({ baseScope: scope.id })} className="accent-[color:var(--color-accent)]" />
                        {item.rarity === "unique" && scope.id === "any" ? "Unique name" : scope.label}
                      </span>
                      <span className="mt-0.5 block pl-5 text-[10px] text-muted">{scope.hint}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={sel.buyout} onChange={(event) => update({ buyout: event.target.checked })} className="accent-[color:var(--color-accent)]" />
                  Instant buyout only
                </label>
              </section>

              {sel.equipment.length > 0 && (
                <SearchRows title="Properties">
                  {sel.equipment.map((row, index) => (
                    <RangeRow
                      key={row.field}
                      checked={row.include}
                      label={row.label}
                      value={row.itemValue}
                      min={row.min}
                      max={row.max}
                      onChecked={(include) => update({ equipment: sel.equipment.map((current, i) => i === index ? { ...current, include } : current) })}
                      onRange={(min, max) => update({ equipment: sel.equipment.map((current, i) => i === index ? { ...current, min, max } : current) })}
                    />
                  ))}
                </SearchRows>
              )}

              {sel.pseudo.length > 0 && (
                <SearchRows title="Replace with totals" hint="A total replaces the raw mods it covers; overlapping resistance totals are mutually exclusive.">
                  {sel.pseudo.map((row, index) => (
                    <RangeRow
                      key={row.statId}
                      checked={row.include}
                      label={row.label}
                      value={row.itemValue}
                      min={row.min}
                      max={row.max}
                      actionLabel="Replace"
                      onChecked={(include) => togglePseudo(index, include)}
                      onRange={(min, max) => update({ pseudo: sel.pseudo.map((current, i) => i === index ? { ...current, min, max } : current) })}
                    />
                  ))}
                </SearchRows>
              )}

              {sel.filters.length > 0 && (
                <SearchRows title="Modifiers" hint={item.rarity === "unique" ? "Unique mods are off by default; enable only rolls that define the variant you need." : "Prefix and suffix keep separate similarity pools. Eldritch implicits start Off because they can be recrafted."}>
                  {bands.map((band) => (
                    <label key={band.key} className="flex items-center gap-2 rounded bg-bg/40 px-2 py-1.5 text-xs text-muted">
                      <span className="min-w-20 text-text">{band.label}</span> match any
                      <input type="number" min={1} max={band.total} value={sel.bandMins[band.key] ?? band.min} onChange={(event) => update({ bandMins: { ...sel.bandMins, [band.key]: Math.max(1, Math.min(band.total, Number(event.target.value) || 1)) } })} className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-text" />
                      of {band.total}
                    </label>
                  ))}
                  {sel.filters.map((filter, index) => (
                    <div key={`${filter.statId}-${index}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.75rem_3.75rem] items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-bg/50">
                      <select value={filter.group} onChange={(event) => update({ filters: sel.filters.map((current, i) => i === index ? { ...current, group: event.target.value as FilterGroup } : current) })} className="rounded border border-border bg-surface px-1 py-1 text-text">
                        {GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                      </select>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {(filter.source === "searing" || filter.source === "eater" || filter.source === "eldritch") && (
                          <span className="shrink-0 rounded border border-accent/40 px-1 text-[9px] uppercase text-accent" title="Eldritch implicit — off by default">
                            Eld
                          </span>
                        )}
                        {filter.fracturedStatId && (
                          <label className={`flex shrink-0 items-center gap-0.5 text-[9px] uppercase ${filter.fractured ? "text-rarity-unique" : "text-muted"}`} title="Require the fractured version of this modifier">
                            <input
                              type="checkbox"
                              checked={filter.fractured}
                              onChange={(event) => update({ filters: sel.filters.map((current, i) => i === index ? { ...current, fractured: event.target.checked } : current) })}
                              className="h-3 w-3 accent-[color:var(--rarity-unique)]"
                            />
                            Frac
                          </label>
                        )}
                        <span className={`truncate ${filter.group === "off" ? "text-muted/50 line-through" : filter.fractured ? "text-rarity-unique" : "text-text"}`} title={filter.text}>{filter.text}</span>
                      </span>
                      <NumberInput value={filter.min} placeholder="min" onChange={(min) => update({ filters: sel.filters.map((current, i) => i === index ? { ...current, min } : current) })} />
                      <NumberInput value={filter.max} placeholder="max" onChange={(max) => update({ filters: sel.filters.map((current, i) => i === index ? { ...current, max } : current) })} />
                    </div>
                  ))}
                </SearchRows>
              )}

              {item.category === "gear" && (
                <SearchRows title="Sockets" hint="Off by default so linking/chroming does not inflate the purchase price.">
                  {game === "poe1" ? (
                    <div className="flex flex-wrap gap-4 text-xs text-muted">
                      {socketCounts.links >= 2 && <label className="flex items-center gap-2"><input type="checkbox" checked={sel.socket.links !== null} onChange={(event) => update({ socket: { ...sel.socket, links: event.target.checked ? socketCounts.links : null } })} className="accent-[color:var(--color-accent)]" /> Require {socketCounts.links}-link</label>}
                      {socketCounts.sockets > 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={sel.socket.sockets !== null} onChange={(event) => update({ socket: { ...sel.socket, sockets: event.target.checked ? socketCounts.sockets : null } })} className="accent-[color:var(--color-accent)]" /> Require {socketCounts.sockets} sockets</label>}
                      {socketCounts.sockets === 0 && <span>No socket data in this PoB item.</span>}
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 text-xs text-muted">
                      Minimum augmentable sockets
                      <input type="number" min={0} max={3} value={sel.socket.runeSockets ?? ""} placeholder="off" onChange={(event) => update({ socket: { ...sel.socket, runeSockets: event.target.value === "" ? null : Number(event.target.value) } })} className="w-16 rounded border border-border bg-surface px-2 py-1 text-text" />
                    </label>
                  )}
                </SearchRows>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <span className="min-w-0 truncate text-xs text-muted">{data?.strategy ?? "Building query…"}</span>
              {data && <a href={data.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-[var(--radius)] bg-accent px-4 py-2 text-sm font-semibold text-bg">Search on Trade ↗</a>}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function SearchRows({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
        {hint && <p className="text-[10px] text-muted/80">{hint}</p>}
      </div>
      <div className="space-y-1 rounded-md border border-border/70 bg-bg/25 p-2">{children}</div>
    </section>
  );
}

function NumberInput({ value, placeholder, onChange }: { value: number | null; placeholder: string; onChange: (value: number | null) => void }) {
  return <input type="number" value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} className="w-full rounded border border-border bg-surface px-1 py-1 text-text" />;
}

function RangeRow({ checked, label, value, min, max, actionLabel, onChecked, onRange }: { checked: boolean; label: string; value: number; min: number | null; max: number | null; actionLabel?: string; onChecked: (checked: boolean) => void; onRange: (min: number | null, max: number | null) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.75rem] items-center gap-1.5 text-xs">
      <label className="flex min-w-0 items-center gap-2">
        <input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} className="accent-[color:var(--color-accent)]" />
        <span className={`truncate ${checked ? "text-text" : "text-muted"}`}>{actionLabel && <span className="mr-1 text-[9px] font-semibold uppercase text-accent">{actionLabel}</span>}{label} <span className="text-muted">({value})</span></span>
      </label>
      <NumberInput value={min} placeholder="min" onChange={(next) => onRange(next, max)} />
      <NumberInput value={max} placeholder="max" onChange={(next) => onRange(min, next)} />
    </div>
  );
}
