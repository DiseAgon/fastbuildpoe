"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { PairBoard, PairRow } from "@/lib/market/officialCx";

type SortKey = "volumeChaos" | "gapPct" | "stockBase";
type PairFilter = "all" | "divine" | "chaos" | "other";

interface BoardResponse {
  success: boolean;
  data: (PairBoard & { leagues: string[] }) | null;
  error: string | null;
}

function fmt(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtRate(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function hourLabel(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function quoteShort(name: string): string {
  if (name === "Chaos Orb") return "c";
  if (name === "Divine Orb") return "div";
  return name;
}

/** "1 Base = lo–hi Quote", auto-inverted so the number reads naturally. */
function RateCell({ row }: { row: PairRow }) {
  if (row.rateLo === null || row.rateHi === null) {
    return <span className="text-xs text-muted">—</span>;
  }
  const invert = row.rateHi < 1;
  const lo = invert ? 1 / row.rateHi : row.rateLo;
  const hi = invert ? 1 / row.rateLo : row.rateHi;
  const left = invert ? quoteShort(row.quoteName) : row.baseName;
  const right = invert ? row.baseName : quoteShort(row.quoteName);
  return (
    <span className="flex flex-col leading-tight">
      <span className="tabular-nums text-text">
        {fmtRate(lo)}–{fmtRate(hi)} {right}
      </span>
      <span className="text-[11px] text-muted">per 1 {left}</span>
    </span>
  );
}

export default function PairExplorerPage() {
  const [league, setLeague] = useState("");
  const [board, setBoard] = useState<(PairBoard & { leagues: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // Empty = auto: scaled to the league's divine price.
  const [minVolume, setMinVolume] = useState("");
  const [pairFilter, setPairFilter] = useState<PairFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volumeChaos");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = useCallback(async (nextLeague: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextLeague) params.set("league", nextLeague);
      const res = await fetch(`/api/pairs?${params}`);
      const json: BoardResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load pair data.");
        return;
      }
      setBoard(json.data);
      setLeague(json.data.league);
    } catch {
      setError("Could not reach the server.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    void load(league, true);
  }, [load, league]);
  useAutoRefresh(refresh);

  const autoMinVolume = useMemo(() => {
    const divine = board?.divinePrice;
    return divine && divine > 0 ? Math.max(50, Math.min(Math.round(divine / 2), 500)) : 100;
  }, [board]);

  const rows = useMemo(() => {
    if (!board) return [];
    const query = search.trim().toLowerCase();
    const min = minVolume === "" ? autoMinVolume : Number.parseFloat(minVolume) || 0;
    const filtered = board.rows.filter((r) => {
      if (pairFilter === "divine" && r.quoteName !== "Divine Orb") return false;
      if (pairFilter === "chaos" && r.quoteName !== "Chaos Orb") return false;
      if (
        pairFilter === "other" &&
        (r.quoteName === "Chaos Orb" || r.quoteName === "Divine Orb")
      )
        return false;
      if (query !== "") {
        const hay = `${r.baseName} ${r.quoteName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      } else if ((r.volumeChaos ?? 0) < min) {
        return false;
      }
      return true;
    });
    const missing = sortDir === "desc" ? -Infinity : Infinity;
    const value = (r: PairRow): number => {
      switch (sortKey) {
        case "volumeChaos":
          return r.volumeChaos ?? missing;
        case "gapPct":
          return r.gapPct ?? missing;
        case "stockBase":
          return r.stockBase;
      }
    };
    const sign = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * (value(b) - value(a))).slice(0, 200);
  }, [board, search, minVolume, autoMinVolume, pairFilter, sortKey, sortDir]);

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
            <h1 className="font-serif text-xl font-bold text-accent">Pair Explorer</h1>
            <p className="text-sm text-muted">
              Official GGG exchange data — real executed gap, true depth, per-pair volume.
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
          <a
            href="/market/picks"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            Flip Picks
          </a>
          <a
            href="/market/bosses"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            Boss Profit
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
        {board && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-semibold text-accent shadow-glow">
              Hour {hourLabel(board.hourStart)}–{hourLabel(board.hourEnd)}
            </span>
            {board.divinePrice !== null && (
              <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted">
                1 Divine ≈ {fmt(board.divinePrice, 0)}c
              </span>
            )}
            <span className="text-xs text-muted">
              {board.rows.length} active pairs · GGG publishes completed hours only (~1–2h behind
              live) · auto-refreshes every 3 min
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border bg-surface p-3 text-sm">
          <label className="sr-only" htmlFor="pair-search">
            Search pairs
          </label>
          <input
            id="pair-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… e.g. scarab"
            className="w-52 rounded-[var(--radius)] border border-border bg-bg px-3 py-1.5 text-text outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <select
            aria-label="Pair type"
            value={pairFilter}
            onChange={(e) => setPairFilter(e.target.value as PairFilter)}
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-text outline-none focus:border-accent"
          >
            <option value="all">All pairs</option>
            <option value="divine">vs Divine</option>
            <option value="chaos">vs Chaos</option>
            <option value="other">Other pairs</option>
          </select>
          <span className="flex items-center gap-2 text-muted">
            <label htmlFor="pair-vol">Min volume (c)</label>
            <input
              id="pair-vol"
              value={minVolume}
              onChange={(e) => setMinVolume(e.target.value)}
              inputMode="numeric"
              placeholder={`auto ${autoMinVolume}`}
              className="w-24 rounded-md border border-border bg-bg px-2 py-1 text-right text-text outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </span>
          <span className="text-xs text-muted">
            Gap = spread between the cheapest and priciest fill of the hour. Big gap + real depth =
            room to sit between buyers and sellers.
          </span>
        </div>

        {error && (
          <p className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 p-3 text-sm text-accent" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-muted">Reading the exchange ledger…</p>}

        {!loading && board && (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface shadow-card">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium text-muted">Pair</th>
                  <th className="px-4 py-3 font-medium text-muted">Rate (hour range)</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("gapPct", "Gap")}</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("volumeChaos", "Volume")}</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("stockBase", "Depth")}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted">Live price</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
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
                        {r.baseIcon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.baseIcon} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain" loading="lazy" />
                        ) : (
                          <span className="inline-block h-6 w-6 rounded bg-surface-raised" aria-hidden />
                        )}
                        <span>
                          <span className="block font-medium text-text">{r.baseName}</span>
                          <span className="block text-xs text-muted">vs {r.quoteName}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <RateCell row={r} />
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        r.gapPct !== null && r.gapPct >= 5 ? "font-semibold text-accent" : ""
                      }`}
                    >
                      {r.gapPct !== null ? `${r.gapPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="tabular-nums text-text">
                        {r.volumeChaos !== null ? `${fmt(r.volumeChaos, 0)}c` : "—"}
                      </span>
                      <span className="block text-[11px] tabular-nums text-muted">
                        {fmt(r.volBase, 0)} {r.baseName.length > 14 ? "items" : r.baseName}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="tabular-nums text-text">{fmt(r.stockBase, 0)}</span>
                      <span className="block text-[11px] tabular-nums text-muted">
                        {fmt(r.stockQuote, 0)} {quoteShort(r.quoteName)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">
                      {r.liveChaos !== null ? `${fmt(r.liveChaos, 1)}c` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="rounded-[var(--radius)] border border-border bg-surface/40 p-4 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-text">
            How to flip with this board
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p>
              This is GGG&apos;s official ledger of what actually traded on the exchange, hour by
              hour. <strong>Rate</strong> shows the cheapest and priciest executed fill;{" "}
              <strong>Gap</strong> is the distance between them — a wide gap means buyers and
              sellers crossed at very different prices, i.e. room to place both a low buy order and
              a high sell order on the same pair. <strong>Depth</strong> is the most stock listed
              during the hour (real liquidity — small depth means your own orders move the price),
              and <strong>Volume</strong> is what actually filled, converted to chaos.
            </p>
            <p>
              Combine with the live boards: use Market flips (poe.ninja, ~5 min fresh) to spot a
              loop, then check the same item here — if the official gap is wider than the loop
              profit, prefer sitting inside the spread on one pair instead of cycling three. Data
              lags 1–2 hours (completed hours only), so treat it as structure, not as a live quote.
            </p>
          </div>
        </details>
      </main>

      <footer className="mt-auto border-t border-border/60 py-6 text-center text-xs text-muted">
        Exchange ledger by{" "}
        <a
          href="https://www.pathofexile.com/developer/docs/reference"
          className="text-accent hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GGG official API
        </a>{" "}
        · names &amp; live prices via poe.ninja · Fan-made tool — not affiliated with Grinding Gear
        Games.
      </footer>
    </div>
  );
}
