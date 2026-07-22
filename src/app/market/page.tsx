"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlipBoard, FlipRow } from "@/lib/market/ninja";

const TYPE_TABS: Array<{ id: string; label: string }> = [
  { id: "Currency", label: "Currency" },
  { id: "Scarab", label: "Scarabs" },
  { id: "Essence", label: "Essences" },
  { id: "Fragment", label: "Fragments" },
  { id: "Oil", label: "Oils" },
  { id: "DeliriumOrb", label: "Delirium" },
  { id: "Fossil", label: "Fossils" },
  { id: "DivinationCard", label: "Div Cards" },
  { id: "Omen", label: "Omens" },
  { id: "Tattoo", label: "Tattoos" },
];

type SortKey = "loopPct" | "volumeChaos" | "trend7d" | "chaosRate";

interface BoardResponse {
  success: boolean;
  data: (FlipBoard & { leagues: string[] }) | null;
  error: string | null;
}

function fmt(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
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

function LoopBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted">no divine pair</span>;
  // pct is the profit of divine→chaos→item→divine; the reverse route's profit
  // is 1/(1+pct) − 1. Show whichever direction is the profitable one.
  const forward = pct >= 0;
  const shownPct = forward ? pct : (1 / (1 + pct / 100) - 1) * 100;
  const strong = shownPct >= 5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        strong
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border bg-surface text-muted"
      }`}
      title={
        forward
          ? "Divine buys chaos → chaos buys item → item sells for divine"
          : "Divine buys item → item sells for chaos → chaos buys divine"
      }
    >
      {forward ? "D→C→item→D" : "D→item→C→D"}
      <span>{shownPct.toFixed(1)}%</span>
    </span>
  );
}

export default function MarketPage() {
  const [type, setType] = useState("Currency");
  const [league, setLeague] = useState<string>("");
  const [board, setBoard] = useState<(FlipBoard & { leagues: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [minVolume, setMinVolume] = useState("500");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("loopPct");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const load = useCallback(async (nextType: string, nextLeague: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: nextType });
      if (nextLeague) params.set("league", nextLeague);
      const res = await fetch(`/api/market?${params}`);
      const json: BoardResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load market data.");
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
    void load(type, league);
    // league is intentionally read once per change through the handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (!board) return [];
    const min = Number.parseFloat(minVolume) || 0;
    const query = search.trim().toLowerCase();
    const filtered = board.rows.filter(
      (r) => (query === "" || r.name.toLowerCase().includes(query)) &&
        (query !== "" || r.volumeChaos >= min),
    );
    // Signed values so ascending surfaces the most-negative loops — those are
    // the same opportunity run in the reverse direction.
    const missing = sortDir === "desc" ? -Infinity : Infinity;
    const value = (r: FlipRow): number => {
      switch (sortKey) {
        case "loopPct":
          return r.loopPct ?? missing;
        case "volumeChaos":
          return r.volumeChaos;
        case "trend7d":
          return r.trend7d ?? missing;
        case "chaosRate":
          return r.chaosRate;
      }
    };
    const sign = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * (value(b) - value(a)));
  }, [board, minVolume, search, sortKey, sortDir]);

  const headerButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) {
          setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        } else {
          setSortKey(key);
          setSortDir("desc");
        }
      }}
      title="Click again to reverse — most-negative loops are the reverse-direction plays"
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
            <h1 className="font-serif text-xl font-bold text-accent">Market Flips</h1>
            <p className="text-sm text-muted">
              Currency Exchange loop finder — divine ⇄ chaos ⇄ item, all in-game.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <a
            href="/"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            ← Build pricer
          </a>
          {board && (
            <select
              aria-label="League"
              value={league}
              onChange={(e) => {
                setLeague(e.target.value);
                void load(type, e.target.value);
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
        <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius)] border border-border bg-surface p-1">
          {TYPE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setType(t.id);
                void load(t.id, league);
              }}
              aria-pressed={type === t.id}
              className={`rounded-[6px] px-3 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] ${
                type === t.id ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-2 px-2 text-sm text-muted">
            <label htmlFor="min-volume">Min volume (c)</label>
            <input
              id="min-volume"
              value={minVolume}
              onChange={(e) => setMinVolume(e.target.value)}
              inputMode="numeric"
              className="w-20 rounded-md border border-border bg-bg px-2 py-1 text-right text-text outline-none focus:border-accent"
            />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 rounded-[var(--radius)] border border-accent/40 bg-accent/10 px-4 py-2 shadow-glow">
            <span className="text-sm text-muted">1 Divine ≈</span>
            <span className="font-serif text-2xl font-bold tabular-nums text-accent">
              {board?.divinePrice ? fmt(board.divinePrice, 0) : "—"}c
            </span>
          </span>
          <label className="sr-only" htmlFor="market-search">
            Search items
          </label>
          <input
            id="market-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… e.g. exalted"
            className="w-56 rounded-[var(--radius)] border border-border bg-surface px-4 py-2 text-sm text-text outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
          />
          <span className="text-xs text-muted">
            Data refreshes ~5 min (poe.ninja) · loop % is before gold fees (3 trades per loop) —
            prefer high-volume, high-percentage rows.
          </span>
        </div>

        {error && (
          <p className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 p-3 text-sm text-accent" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-muted">Loading market…</p>}

        {!loading && board && (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface shadow-card">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium text-muted">Item</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("chaosRate", "Chaos pair")}</th>
                  <th
                    className="px-4 py-3 text-right font-medium text-muted"
                    title="Price on the divine pair, converted to chaos. Small text: how many items 1 divine buys."
                  >
                    Divine pair
                  </th>
                  <th className="px-4 py-3 font-medium">{headerButton("loopPct", "Flip loop")}</th>
                  <th className="px-4 py-3 text-right font-medium">{headerButton("volumeChaos", "Volume (c)")}</th>
                  <th className="px-4 py-3 font-medium">{headerButton("trend7d", "7d trend")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      No rows above this volume threshold.
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
                        {r.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt="" width={24} height={24} className="h-6 w-6" loading="lazy" />
                        ) : (
                          <span className="inline-block h-6 w-6 rounded bg-surface-raised" aria-hidden />
                        )}
                        <span className="font-medium text-text">{r.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.chaosRate, 2)}c</td>
                    <td className="px-4 py-2 text-right">
                      <span className="tabular-nums text-text">{fmt(r.divineLegChaos, 2)}c</span>
                      {r.perDivine !== null && (
                        <span className="block text-[11px] tabular-nums text-muted">
                          {fmt(r.perDivine, 2)} / div
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <LoopBadge pct={r.loopPct} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.volumeChaos, 0)}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <Sparkline data={r.sparkline} />
                        <span className={`tabular-nums text-xs ${r.trend7d !== null && r.trend7d < 0 ? "text-accent" : "text-accent-2"}`}>
                          {r.trend7d !== null ? `${r.trend7d > 0 ? "+" : ""}${r.trend7d.toFixed(1)}%` : "—"}
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
          <summary className="cursor-pointer font-medium text-text">How the flip loop works</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p>
              Every item on the Currency Exchange trades on two markets: a <em>chaos pair</em> and a{" "}
              <em>divine pair</em>. When their implied prices diverge, a full loop is profitable
              before fees — <strong>D→C→item→D</strong>: your divines buy chaos, the chaos buys the
              item, and the item sells back for more divines than you started with.{" "}
              <strong>D→item→C→D</strong> is the same loop run the other way (buy the item with
              divines, sell it for chaos, convert back to divines).
            </p>
            <p>
              The exchange charges <strong>gold</strong> per trade (scaling with trade value), which
              this board cannot fetch — no public API exposes gold fees. A loop is 3 trades, so
              treat small percentages as break-even and prioritise volume so your orders actually
              fill. Rates are ~5-minute snapshots of filled trades, not a live order book.
            </p>
            <p>
              <strong>Bid/ask gaps:</strong> inside a single pair the in-game order book also has a
              buy/sell gap that no public API exposes — wide-gap items (often low-volume ones) can
              pay far more than the loop % shown here if you post orders on both sides and wait.
              Use the volume column as a fill-speed proxy: low volume = wider gaps but slower
              trades. Check the in-game book before committing large capital.
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
