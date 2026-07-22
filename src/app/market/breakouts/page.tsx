"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BreakoutBoard, BreakoutRow } from "@/lib/market/ninja";

type SortKey = "score" | "d1" | "trend7d" | "chaosValue" | "listingCount";

interface BoardResponse {
  success: boolean;
  data: (BreakoutBoard & { leagues: string[] }) | null;
  error: string | null;
}

function fmt(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function pct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function Sparkline({ data }: { data: Array<number | null> }) {
  const points = data.filter((d): d is number => d !== null && Number.isFinite(d));
  if (points.length < 2) return <span className="text-xs text-muted">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 72;
  const h = 20;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden className="shrink-0">
      <path
        d={path}
        fill="none"
        stroke={up ? "var(--color-accent-2)" : "var(--color-accent)"}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BreakoutsPage() {
  const [league, setLeague] = useState("");
  const [board, setBoard] = useState<(BreakoutBoard & { leagues: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minListings, setMinListings] = useState("10");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = useCallback(async (nextLeague: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextLeague) params.set("league", nextLeague);
      const res = await fetch(`/api/breakout?${params}`);
      const json: BoardResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load breakout data.");
        return;
      }
      setBoard(json.data);
      setLeague(json.data.league);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (!board) return [];
    const query = search.trim().toLowerCase();
    const max = Number.parseFloat(maxPrice);
    const minList = Number.parseFloat(minListings) || 0;
    const filtered = board.rows.filter(
      (r) =>
        (query === "" || r.name.toLowerCase().includes(query)) &&
        (query !== "" ||
          ((!Number.isFinite(max) || r.chaosValue <= max) && r.listingCount >= minList)),
    );
    const missing = sortDir === "desc" ? -Infinity : Infinity;
    const value = (r: BreakoutRow): number => {
      switch (sortKey) {
        case "score":
          return r.score;
        case "d1":
          return r.d1;
        case "trend7d":
          return r.trend7d ?? missing;
        case "chaosValue":
          return r.chaosValue;
        case "listingCount":
          return r.listingCount;
      }
    };
    const sign = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * (value(b) - value(a))).slice(0, 150);
  }, [board, search, maxPrice, minListings, sortKey, sortDir]);

  const headerButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        else {
          setSortKey(key);
          setSortDir("desc");
        }
      }}
      className={`inline-flex items-center gap-1 ${
        sortKey === key ? "text-accent" : "text-muted hover:text-text"
      }`}
    >
      {label}
      {sortKey === key ? <span aria-hidden>{sortDir === "desc" ? "▾" : "▴"}</span> : null}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cat.svg" alt="FastBuildPOE logo" width={36} height={36} className="h-9 w-9" />
          <div>
            <h1 className="font-serif text-xl font-bold text-accent">Breakout Radar</h1>
            <p className="text-sm text-muted">
              Uniques whose price is accelerating — catch the next viral build before it peaks.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <a
            href="/market"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            ← Market flips
          </a>
          {board && (
            <select
              aria-label="League"
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                void load(e.target.value);
              }}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-text outline-none focus:border-accent"
            >
              {board.leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 pb-16">
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm">
          <label className="sr-only" htmlFor="bo-search">
            Search uniques
          </label>
          <input
            id="bo-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… e.g. iron flask"
            className="w-52 rounded-[var(--radius)] border border-border bg-bg px-3 py-1.5 text-text outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <span className="flex items-center gap-2 text-muted">
            <label htmlFor="bo-max">Max price (c)</label>
            <input
              id="bo-max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              inputMode="numeric"
              placeholder="any"
              className="w-20 rounded-md border border-border bg-bg px-2 py-1 text-right text-text outline-none focus:border-accent"
            />
          </span>
          <span className="flex items-center gap-2 text-muted">
            <label htmlFor="bo-list">Min listings</label>
            <input
              id="bo-list"
              value={minListings}
              onChange={(e) => setMinListings(e.target.value)}
              inputMode="numeric"
              className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-right text-text outline-none focus:border-accent"
            />
          </span>
          <span className="text-xs text-muted">
            Score = 1-day momentum + acceleration vs the earlier week. Cheap item + high score +
            shrinking listings = possible viral-build pickup.
          </span>
        </div>

        {error && (
          <p className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 p-3 text-sm text-accent" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-muted">Scanning uniques…</p>}

        {!loading && board && (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface shadow-card">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium text-muted">Unique</th>
                  <th className="px-4 py-3 font-medium text-muted">Slot</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("chaosValue", "Price")}</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("d1", "1d")}</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("score", "Score")}</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("listingCount", "Listings")}</th>
                  <th className="px-4 py-3 font-medium">{headerButton("trend7d", "7d trend")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted">
                      Nothing matches these filters.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 transition-colors duration-[var(--duration-fast)] last:border-b-0 hover:bg-surface-raised"
                  >
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        {r.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.icon} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain" loading="lazy" />
                        ) : (
                          <span className="inline-block h-6 w-6 rounded bg-surface-raised" aria-hidden />
                        )}
                        <span>
                          <span className="block font-medium text-rarity-unique">{r.name}</span>
                          {r.baseType && <span className="block text-xs text-muted">{r.baseType}</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">{r.category}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="tabular-nums text-text">{fmt(r.chaosValue, 1)}c</span>
                      {r.divineValue !== null && r.divineValue >= 0.5 && (
                        <span className="block text-[11px] tabular-nums text-muted">
                          {fmt(r.divineValue, 1)} div
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${r.d1 >= 10 ? "font-semibold text-accent" : ""}`}>
                      {pct(r.d1)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          r.score >= 15
                            ? "border border-accent/50 bg-accent/10 text-accent"
                            : "text-muted"
                        }`}
                      >
                        {r.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">{r.listingCount}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <Sparkline data={r.sparkline} />
                        <span className={`tabular-nums text-xs ${r.trend7d !== null && r.trend7d < 0 ? "text-accent" : "text-accent-2"}`}>
                          {pct(r.trend7d)}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="rounded-[var(--radius)] border border-border bg-surface/40 p-4 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-text">How to read this board</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p>
              When a new build goes viral (e.g. CoWB in 3.28 — its unique belt and ilvl-83 Iron
              Flasks exploded in price), its uniques accelerate <em>before</em> they peak. This board
              ranks every tracked unique by that acceleration: <strong>1d</strong> is the last day&apos;s
              move, <strong>Score</strong> adds how abnormal that move is vs the item&apos;s earlier
              week. Set a max price to hunt cheap items only, and use listings as a buyability check
              — a spiking item with collapsing listings is being bought out.
            </p>
            <p>
              Caveats: prices come from trade listings (~hourly granularity, per unique name) — an
              item-level or link-specific premium (like ilvl 83 flasks) shows up here only as the
              base name moving. Always confirm on the trade site before buying in bulk, and remember
              day-one league data is thin.
            </p>
          </div>
        </details>
      </main>

      <footer className="mt-auto border-t border-border/60 py-6 text-center text-xs text-muted">
        Market data by{" "}
        <a href="https://poe.ninja" className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
          poe.ninja
        </a>{" "}
        · Fan-made tool — not affiliated with Grinding Gear Games.
      </footer>
    </div>
  );
}
