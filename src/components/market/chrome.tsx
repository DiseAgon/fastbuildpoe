"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function fmt(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function Sparkline({ data }: { data: Array<number | null> }) {
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

export const marketNavClass =
  "rounded-full border border-border bg-surface px-3 py-1.5 text-muted transition-colors hover:border-accent/50 hover:text-accent";

export const marketNavAccentClass =
  "rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 font-medium text-accent transition-colors hover:bg-accent/20";

export function MarketShell({
  title,
  subtitle,
  nav,
  league,
  leagues,
  onLeagueChange,
  children,
}: {
  title: string;
  subtitle: string;
  nav: ReactNode;
  league: string;
  leagues?: string[];
  onLeagueChange: (league: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cat.svg" alt="FastBuildPOE logo" width={36} height={36} className="h-9 w-9" />
          <div>
            <h1 className="font-serif text-xl font-bold text-accent">{title}</h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {nav}
          {leagues && leagues.length > 0 && (
            <select
              aria-label="League"
              value={league}
              onChange={(e) => onLeagueChange(e.target.value)}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-text outline-none focus:border-accent"
            >
              {leagues.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 pb-16">{children}</main>
    </div>
  );
}
