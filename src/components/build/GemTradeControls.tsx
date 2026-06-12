"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedItem } from "@/types/item";
import { useBuild } from "./BuildContext";

function toNum(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Trade controls for a gem: editable min Level / Quality / Sockets (PoE2). */
export function GemTradeControls({ item }: { item: ParsedItem }) {
  const { game, league } = useBuild();
  const [level, setLevel] = useState(item.gemLevel != null ? String(item.gemLevel) : "");
  const [quality, setQuality] = useState(item.quality != null ? String(item.quality) : "");
  const [sockets, setSockets] = useState("");
  const [buyout, setBuyout] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      fetch("/api/trade/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game,
          mode: "asis",
          league: league ?? undefined,
          item,
          buyout,
          gem: { level: toNum(level), quality: toNum(quality), sockets: toNum(sockets) },
        }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (j.success && j.data?.url) setUrl(j.data.url);
          else {
            setError(j.error ?? "Failed to build link.");
            setUrl(null);
          }
        })
        .catch(() => !cancelled && setError("Could not reach the server."))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, league, buyout, level, quality, sockets, item]);

  const field =
    "w-14 rounded border border-border bg-surface px-1 py-0.5 text-sm text-text outline-none focus:border-accent";

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-border/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <label className="flex items-center gap-1">
          Level ≥<input type="number" value={level} onChange={(e) => setLevel(e.target.value)} className={field} />
        </label>
        <label className="flex items-center gap-1">
          Quality ≥<input type="number" value={quality} onChange={(e) => setQuality(e.target.value)} className={field} />
        </label>
        {game === "poe2" && (
          <label className="flex items-center gap-1">
            Sockets ≥
            <input type="number" value={sockets} onChange={(e) => setSockets(e.target.value)} className={field} />
          </label>
        )}
        <label className="flex items-center gap-1" title="Only listings with a fixed buyout price">
          <input
            type="checkbox"
            checked={buyout}
            onChange={(e) => setBuyout(e.target.checked)}
            className="h-3.5 w-3.5 accent-[color:var(--color-accent)]"
          />
          Buy-out
        </label>
      </div>

      <div className="flex items-center gap-2">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Open trade search ↗
          </a>
        ) : (
          <span className="text-sm text-muted">{loading ? "Building link…" : "—"}</span>
        )}
        {error && (
          <span className="text-xs text-red-400" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
