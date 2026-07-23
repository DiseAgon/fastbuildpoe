"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
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

type SortKey = "loopPct" | "volumeChaos" | "trend7d" | "chaosRate" | "gap";

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

/**
 * Both loop directions for a row. Exactly one is non-negative:
 *  - fwd (D→C→item→D): divine buys chaos, chaos buys item, item sells for divine
 *  - rev (D→item→C→D): divine buys item, item sells for chaos, chaos buys divine
 * The same numbers double as conversion edges: fwd > 0 also means C→D converts
 * cheaper via the item than directly; rev > 0 means D→C pays more via the item.
 */
function loopDirections(r: FlipRow, divinePrice: number | null) {
  if (r.perDivine === null || divinePrice === null || r.chaosRate <= 0) return null;
  const fwd = (divinePrice / (r.chaosRate * r.perDivine) - 1) * 100;
  const rev = ((r.chaosRate * r.perDivine) / divinePrice - 1) * 100;
  return fwd >= rev
    ? { route: "D→C→item→D", pct: fwd, altRoute: "D→item→C→D", altPct: rev }
    : { route: "D→item→C→D", pct: rev, altRoute: "D→C→item→D", altPct: fwd };
}

function LoopBadge({ row, divinePrice }: { row: FlipRow; divinePrice: number | null }) {
  const best = loopDirections(row, divinePrice);
  if (!best) return <span className="text-xs text-muted">no divine pair</span>;
  const strong = best.pct >= 5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        strong
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border bg-surface text-muted"
      }`}
      title={`Best: ${best.route} ${best.pct >= 0 ? "+" : ""}${best.pct.toFixed(2)}% · other direction: ${best.altRoute} ${best.altPct.toFixed(2)}%`}
    >
      {best.route}
      <span>
        {best.pct >= 0 ? "+" : ""}
        {best.pct.toFixed(1)}%
      </span>
    </span>
  );
}

/** Top via-item routes for converting between divine and chaos. */
function BestRoutes({ rows, divinePrice, minVolume }: { rows: FlipRow[]; divinePrice: number | null; minVolume: number }) {
  if (divinePrice === null) return null;
  const eligible = rows.filter(
    (r) => r.perDivine !== null && r.chaosRate > 0 && r.volumeChaos >= minVolume,
  );
  // D→C via item: 1 div → perDivine items → perDivine × chaosRate chaos.
  const dToC = eligible
    .map((r) => ({ r, chaosOut: r.perDivine! * r.chaosRate }))
    .filter((x) => x.chaosOut > divinePrice)
    .sort((a, b) => b.chaosOut - a.chaosOut)
    .slice(0, 3);
  // C→D via item: divinePrice chaos would buy divinePrice/chaosRate items,
  // which convert to divines at perDivine per div → effective chaos cost/div.
  const cToD = eligible
    .map((r) => ({ r, chaosCost: r.chaosRate * r.perDivine! }))
    .filter((x) => x.chaosCost < divinePrice)
    .sort((a, b) => a.chaosCost - b.chaosCost)
    .slice(0, 3);

  if (dToC.length === 0 && cToD.length === 0) return null;

  const routeList = (
    title: string,
    directLabel: string,
    entries: Array<{ name: string; detail: string; pct: number }>,
  ) => (
    <div className="flex-1 rounded-[var(--radius)] border border-border bg-surface p-4">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-0.5 text-xs text-muted">Direct: {directLabel}</p>
      <ol className="mt-2 space-y-1">
        {entries.map((e, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-text">{e.name}</span>
            <span className="shrink-0 tabular-nums text-muted">{e.detail}</span>
            <span className="shrink-0 font-semibold tabular-nums text-accent">
              +{e.pct.toFixed(2)}%
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <section aria-label="Best conversion routes" className="flex flex-col gap-3 sm:flex-row">
      {dToC.length > 0 &&
        routeList(
          "Best Divine → Chaos (via item)",
          `1 div = ${fmt(divinePrice, 0)}c`,
          dToC.map(({ r, chaosOut }) => ({
            name: `Div → ${r.name} → Chaos`,
            detail: `1 div ≈ ${fmt(chaosOut, 0)}c`,
            pct: (chaosOut / divinePrice - 1) * 100,
          })),
        )}
      {cToD.length > 0 &&
        routeList(
          "Best Chaos → Divine (via item)",
          `1 div costs ${fmt(divinePrice, 0)}c`,
          cToD.map(({ r, chaosCost }) => ({
            name: `Chaos → ${r.name} → Div`,
            detail: `1 div ≈ ${fmt(chaosCost, 0)}c`,
            pct: (divinePrice / chaosCost - 1) * 100,
          })),
        )}
    </section>
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

  const load = useCallback(async (nextType: string, nextLeague: string, silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(type, league);
    // league is intentionally read once per change through the handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => {
    void load(type, league, true);
  }, [load, type, league]);
  useAutoRefresh(refresh);

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
        case "loopPct": {
          const best = loopDirections(r, board.divinePrice);
          return best ? best.pct : missing;
        }
        case "volumeChaos":
          return r.volumeChaos;
        case "trend7d":
          return r.trend7d ?? missing;
        case "chaosRate":
          return r.chaosRate;
        case "gap": {
          const gaps = [r.official?.chaosGapPct, r.official?.divineGapPct].filter(
            (g): g is number => g !== null && g !== undefined,
          );
          return gaps.length > 0 ? Math.max(...gaps) : missing;
        }
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
          <a
            href="/market/breakouts"
            className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-medium text-accent transition-colors hover:bg-accent/20"
            title="Uniques with accelerating prices — viral-build detector"
          >
            Breakout Radar
          </a>
          <a
            href="/market/bosses"
            className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-medium text-accent transition-colors hover:bg-accent/20"
            title="Uber fragment costs vs boss drop prices"
          >
            Boss Profit
          </a>
          <a
            href="/market/pairs"
            className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-medium text-accent transition-colors hover:bg-accent/20"
            title="Official GGG exchange ledger — per-pair gap, depth and volume"
          >
            Pair Explorer
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
          {board && (
            <span className="text-xs text-muted">
              auto-refreshes every 3 min · updated{" "}
              {new Date(board.fetchedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {board.officialHour && (
                <>
                  {" "}
                  · Gap/Depth from official hour{" "}
                  {new Date(board.officialHour.start * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  –
                  {new Date(board.officialHour.end * 1000).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </>
              )}
            </span>
          )}
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
          <BestRoutes
            rows={board.rows}
            divinePrice={board.divinePrice}
            minVolume={Number.parseFloat(minVolume) || 0}
          />
        )}

        {!loading && board && (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface shadow-card">
            <table className="w-full min-w-[960px] border-collapse text-sm">
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
                  <th
                    className="px-4 py-3 text-right font-medium"
                    title="Official GGG data, last completed hour: spread between the cheapest and priciest executed fill on the chaos pair (c) and divine pair (div)."
                  >
                    {headerButton("gap", "Gap 1h")}
                  </th>
                  <th
                    className="px-4 py-3 text-right font-medium text-muted"
                    title="Official GGG data: peak items listed on the exchange during the hour (real order-book depth), and chaos actually traded that hour."
                  >
                    Depth
                  </th>
                  <th className="px-4 py-3 font-medium">{headerButton("trend7d", "7d trend")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted">
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
                      <LoopBadge row={r} divinePrice={board.divinePrice} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.volumeChaos, 0)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.official?.chaosGapPct != null || r.official?.divineGapPct != null ? (
                        <>
                          <span
                            className={`tabular-nums ${
                              (r.official.chaosGapPct ?? 0) >= 5 ||
                              (r.official.divineGapPct ?? 0) >= 5
                                ? "font-semibold text-accent"
                                : "text-text"
                            }`}
                          >
                            {r.official.chaosGapPct != null
                              ? `${r.official.chaosGapPct.toFixed(1)}% c`
                              : "—"}
                          </span>
                          <span className="block text-[11px] tabular-nums text-muted">
                            {r.official.divineGapPct != null
                              ? `${r.official.divineGapPct.toFixed(1)}% div`
                              : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.official?.depthItems != null ? (
                        <>
                          <span className="tabular-nums text-text">
                            {fmt(r.official.depthItems, 0)}
                          </span>
                          {r.official.volumeChaos1h != null && (
                            <span className="block text-[11px] tabular-nums text-muted">
                              {fmt(r.official.volumeChaos1h, 0)}c/h
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
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
