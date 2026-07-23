"use client";

import { useCallback, useEffect, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { BossBoard, BossCard, BossDrop, BossSection } from "@/lib/market/bosses";

interface BoardResponse {
  success: boolean;
  data: (BossBoard & { leagues: string[] }) | null;
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

function ChaosPrice({
  chaos,
  divinePrice,
  strong,
}: {
  chaos: number | null;
  divinePrice: number | null;
  strong?: boolean;
}) {
  if (chaos === null) return <span className="text-xs text-muted">no price</span>;
  const divine = divinePrice && divinePrice > 0 ? chaos / divinePrice : null;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={`tabular-nums ${strong ? "font-semibold text-text" : "text-text"}`}>
        {fmt(chaos, 1)}c
      </span>
      {divine !== null && divine >= 0.5 && (
        <span className="text-[11px] tabular-nums text-muted">≈ {fmt(divine, 1)} div</span>
      )}
    </span>
  );
}

function CostGroupRow({
  group,
  divinePrice,
}: {
  group: BossSection;
  divinePrice: number | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-surface-raised/60 px-3 py-2">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-medium text-muted">
          {group.label}
        </span>
        {group.items.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1 text-muted">
            {item.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.icon} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" loading="lazy" />
            )}
            <span>
              {item.qty}× {item.label}
            </span>
            <span className="tabular-nums text-text/80">
              {item.unitChaos !== null ? `${fmt(item.unitChaos, 1)}c` : "—"}
            </span>
          </span>
        ))}
      </span>
      <span className="text-sm">
        {group.totalChaos > 0 ? (
          <span className="inline-flex items-baseline gap-1">
            {group.missing > 0 && <span className="text-xs text-muted">≥</span>}
            <ChaosPrice chaos={group.totalChaos} divinePrice={divinePrice} strong />
          </span>
        ) : (
          <span className="text-xs text-muted">no exchange price</span>
        )}
      </span>
    </div>
  );
}

function DropRow({ drop, divinePrice }: { drop: BossDrop; divinePrice: number | null }) {
  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="py-1.5 pr-2">
        <span className="flex items-center gap-2">
          {drop.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={drop.icon} alt="" width={24} height={24} className="h-6 w-6 object-contain" loading="lazy" />
          ) : (
            <span className="inline-block h-6 w-6 rounded bg-surface-raised" aria-hidden />
          )}
          <span className="font-medium text-rarity-unique">{drop.name}</span>
          {drop.variants > 1 && (
            <span className="text-[10px] text-muted" title="Highest-priced variant shown">
              {drop.variants} variants
            </span>
          )}
        </span>
      </td>
      <td className="py-1.5 pl-2 text-right">
        <ChaosPrice chaos={drop.chaos} divinePrice={divinePrice} />
      </td>
      <td className="py-1.5 pl-3 text-right text-xs tabular-nums text-muted">
        {drop.listings ?? "—"}
      </td>
      <td
        className={`py-1.5 pl-3 text-right text-xs tabular-nums ${
          drop.trend7d !== null && drop.trend7d > 0 ? "text-accent-2" : "text-muted"
        }`}
      >
        {pct(drop.trend7d)}
      </td>
    </tr>
  );
}

function BossCardView({ boss, divinePrice }: { boss: BossCard; divinePrice: number | null }) {
  const ratio =
    boss.uberCostChaos && boss.topDropChaos && boss.uberCostChaos > 0
      ? boss.topDropChaos / boss.uberCostChaos
      : null;
  return (
    <section
      className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-card"
      aria-labelledby={`boss-${boss.id}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`boss-${boss.id}`} className="font-serif text-lg font-bold text-text">
            {boss.name}
          </h2>
          <p className="text-xs text-muted">{boss.subtitle}</p>
        </div>
        {ratio !== null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
              ratio >= 1
                ? "border border-accent/50 bg-accent/10 text-accent"
                : "border border-border bg-surface-raised text-muted"
            }`}
            title="Best single drop vs the uber entry cost — not an expected value"
          >
            top drop ≈ {ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× entry
          </span>
        )}
      </header>

      {boss.sections.map((sec) => (
        <div
          key={sec.label}
          className="flex flex-col gap-2 rounded-md border border-border/50 p-2.5"
        >
          <CostGroupRow group={sec} divinePrice={divinePrice} />
          {sec.costNote && <p className="px-1 text-xs text-muted">{sec.costNote}</p>}
          {sec.drops.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="py-1 pr-2 font-medium">{sec.label} drops</th>
                    <th className="py-1 pl-2 text-right font-medium">Price</th>
                    <th className="py-1 pl-3 text-right font-medium">Listings</th>
                    <th className="py-1 pl-3 text-right font-medium">7d</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.drops.map((drop) => (
                    <DropRow
                      key={`${boss.id}-${sec.label}-${drop.name}`}
                      drop={drop}
                      divinePrice={divinePrice}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sec.note && <p className="px-1 text-xs text-muted">{sec.note}</p>}
        </div>
      ))}

      {boss.note && <p className="text-xs text-muted">{boss.note}</p>}
    </section>
  );
}

export default function BossProfitPage() {
  const [league, setLeague] = useState("");
  const [board, setBoard] = useState<(BossBoard & { leagues: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextLeague: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextLeague) params.set("league", nextLeague);
      const res = await fetch(`/api/bosses?${params}`);
      const json: BoardResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load boss data.");
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

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cat.svg" alt="FastBuildPOE logo" width={36} height={36} className="h-9 w-9" />
          <div>
            <h1 className="font-serif text-xl font-bold text-accent">Boss Profit</h1>
            <p className="text-sm text-muted">
              What each uber fight costs to open vs what its drops sell for — right now.
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
            href="/market/breakouts"
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            Breakout Radar
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
              League: {board.league} · poe.ninja (~5 min delay) · auto-refreshes every 3 min ·
              updated{" "}
              {new Date(board.fetchedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        {error && (
          <p className="rounded-[var(--radius)] border border-accent/40 bg-accent/5 p-3 text-sm text-accent" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-muted">Pricing fragments and drops…</p>}

        {!loading && board && (
          <div className="grid gap-4 xl:grid-cols-2">
            {board.bosses.map((boss) => (
              <BossCardView key={boss.id} boss={boss} divinePrice={board.divinePrice} />
            ))}
          </div>
        )}

        <details className="rounded-[var(--radius)] border border-border bg-surface/40 p-4 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-text">
            How to read this board (early-league boss farming)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p>
              Each card shows the <strong>entry cost</strong> of a fight (4 uber fragments from T17
              maps, or the standard-version set) priced live on the in-game Currency Exchange, next
              to the current sale price of its <strong>notable drops</strong>. The &quot;top drop&quot;
              badge compares the single best drop against the uber entry cost — it is a ceiling, not
              an expected value: drop chances are not public, so judge with the whole table (several
              mid-value drops can beat one jackpot).
            </p>
            <p>
              Each boss is split into <strong>Uber</strong> (top) and <strong>Standard</strong>{" "}
              (bottom) because the pools differ — the uber fight also drops the whole standard pool.
              Early-league timing: fragment prices are highest on days 1–3 (few T17s in circulation)
              while uber-exclusive uniques also peak — run the standard versions until fragments
              cool off, then switch to ubers. Sell drops fast — almost everything here bleeds value
              as the league ages.
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
