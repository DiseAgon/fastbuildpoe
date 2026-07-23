"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { FlipPick, PicksBoard } from "@/lib/market/recommend";

interface BoardResponse {
  success: boolean;
  data: (PicksBoard & { leagues: string[] }) | null;
  error: string | null;
}

function fmt(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function hourLabel(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StrategyBadge({ pick }: { pick: FlipPick }) {
  const isSpread = pick.strategy.startsWith("spread");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        isSpread
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-accent-2/50 bg-accent-2/10 text-accent-2"
      }`}
      title={
        isSpread
          ? "Buy low / re-sell high on ONE pair (2 orders). Edge from the official executed range of the last hour, with a 50% capture haircut."
          : "Triangular loop across the chaos and divine pairs (3 orders). Edge from live poe.ninja rates."
      }
    >
      {pick.strategyLabel}
      <span className="opacity-70">· {pick.trades} trades</span>
    </span>
  );
}

export default function FlipPicksPage() {
  const [league, setLeague] = useState("");
  const [board, setBoard] = useState<(PicksBoard & { leagues: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (nextLeague: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextLeague) params.set("league", nextLeague);
      const res = await fetch(`/api/recommend?${params}`);
      const json: BoardResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load recommendations.");
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

  const picks = useMemo(() => {
    if (!board) return [];
    const query = search.trim().toLowerCase();
    if (query === "") return board.picks;
    return board.picks.filter((p) => p.name.toLowerCase().includes(query));
  }, [board, search]);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cat.svg" alt="FastBuildPOE logo" width={36} height={36} className="h-9 w-9" />
          <div>
            <h1 className="font-serif text-xl font-bold text-accent">Flip Picks</h1>
            <p className="text-sm text-muted">
              Best flip per item across four strategies — live loops + official spread data.
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
            href="/market/pairs"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            Pair Explorer
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
              1 Divine ≈ {fmt(board.divinePrice, 0)}c
            </span>
            <span className="text-xs text-muted">
              {board.evaluated} items evaluated · league {board.league}
              {board.officialHour &&
                ` · spread data from hour ${hourLabel(board.officialHour.start)}–${hourLabel(board.officialHour.end)}`}{" "}
              · auto-refreshes every 3 min
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search picks…"
              aria-label="Search picks"
              className="ml-auto w-44 rounded-[var(--radius)] border border-border bg-bg px-3 py-1.5 text-text outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </div>
        )}

        {error && (
          <p className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 p-3 text-sm text-accent" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-muted">Evaluating strategies…</p>}

        {!loading && board && (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface shadow-card">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 text-right font-medium" title="Edge after assumptions (spreads: 50% of the executed range). Small text: the raw number.">
                    Net edge
                  </th>
                  <th className="px-4 py-3 text-right font-medium" title="Chaos that actually flowed through the strategy's market (official ledger for spreads, poe.ninja volume for loops).">
                    Volume basis
                  </th>
                  <th className="px-4 py-3 text-right font-medium" title="Peak items listed during the official hour.">
                    Depth
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Live price</th>
                  <th className="px-4 py-3 font-medium">Also viable</th>
                </tr>
              </thead>
              <tbody>
                {picks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted">
                      No strategy clears the gates right now — early league hours can be thin.
                    </td>
                  </tr>
                )}
                {picks.map((p, i) => (
                  <tr
                    key={p.id}
                    className="border-b border-border/50 transition-colors duration-[var(--duration-fast)] last:border-b-0 hover:bg-surface-raised"
                  >
                    <td className="px-4 py-2 tabular-nums text-muted">{i + 1}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        {p.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.icon} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain" loading="lazy" />
                        ) : (
                          <span className="inline-block h-6 w-6 rounded bg-surface-raised" aria-hidden />
                        )}
                        <span>
                          <span className="block font-medium text-text">{p.name}</span>
                          <span className="block text-xs text-muted">{p.type}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <StrategyBadge pick={p} />
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {p.confidence === "live" ? "live rates" : "last-hour ledger"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`tabular-nums font-semibold ${
                          p.netEdgePct >= 5 ? "text-accent" : "text-text"
                        }`}
                      >
                        +{p.netEdgePct.toFixed(1)}%
                      </span>
                      {p.edgePct !== p.netEdgePct && (
                        <span className="block text-[11px] tabular-nums text-muted">
                          raw {p.edgePct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(p.volumeBasisChaos, 0)}c</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">
                      {p.depthItems !== null ? fmt(p.depthItems, 0) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">{fmt(p.chaosRate, 1)}c</td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {p.altLabel ? `${p.altLabel} +${p.altNetEdgePct?.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="rounded-[var(--radius)] border border-border bg-surface/40 p-4 text-sm text-muted" open>
          <summary className="cursor-pointer font-medium text-text">
            How these picks are computed (read once before trading)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p>
              Four strategies are evaluated per item and the best is shown. <strong>Loops</strong>{" "}
              (blue) cycle divine → chaos → item → divine using live poe.ninja rates (~5 min old) —
              executable right now, but 3 orders means 3 gold fees. <strong>Spreads</strong>{" "}
              (orange) are the case you asked for: buy the item with divines and re-sell it for
              divines (or chaos) at a better ratio on the <em>same pair</em> — 2 orders, edge taken
              from the official ledger&apos;s real executed range last hour, haircut to 50% because
              you sit inside the extremes.
            </p>
            <p>
              Gates: loops need ≥2,000c live volume; spreads need ≥3,000c traded through that exact
              pair last hour, a 3–60% gap (bigger gaps are one-off whale fills, not repeatable
              spreads), and the hour&apos;s executed mid must sit within 40% of the live price —
              otherwise the gap was a transient mispricing and is discarded. Ranking = net edge ×
              log(volume), so a 4% edge on a
              200,000c/h market outranks a 30% edge on a dead one. Gold fees are not modelled (no
              public API) — prefer spreads on equal edge, and always sanity-check the pair in the
              Pair Explorer before committing a large bankroll. Spread edges are last-hour
              statistics, not a guaranteed fill — and on divine pairs where 1 div only buys a few
              units, ratios quantize (2:1 vs 3:1 reads as a &quot;50%&quot; gap), so verify the
              actual rate range before ordering.
            </p>
          </div>
        </details>
      </main>

      <footer className="mt-auto border-t border-border/60 py-6 text-center text-xs text-muted">
        Live rates by poe.ninja · executed ledger by GGG official API · Fan-made tool — not
        affiliated with Grinding Gear Games.
      </footer>
    </div>
  );
}
