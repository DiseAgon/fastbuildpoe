"use client";

import { useState } from "react";
import type { GameId } from "@/lib/game/registry";
import { encodeShare } from "@/lib/share";

/**
 * Copies a shareable URL (build + chosen league + the prices the user wrote
 * down) to the clipboard. State rides in the URL hash, so no server storage.
 */
export function ShareButton({
  game,
  input,
  setId,
  league,
  prices,
}: {
  game: GameId;
  input: string;
  setId: string;
  league: string;
  prices: Record<string, string>;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const canShare = input.trim().length > 0;

  async function handleShare() {
    setError(false);
    try {
      // Only this game's non-empty prices.
      const gamePrices = Object.fromEntries(
        Object.entries(prices).filter(([k, v]) => k.startsWith(`${game}|`) && v !== ""),
      );
      const encoded = encodeShare({ v: 1, game, input, setId, league, prices: gamePrices });
      const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
    }
  }

  if (!canShare) return null;

  return (
    <button
      type="button"
      onClick={handleShare}
      className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1 text-sm text-muted transition-colors duration-[var(--duration-fast)] hover:border-accent/50 hover:text-accent"
    >
      {copied ? "Link copied ✓" : error ? "Copy failed" : "Share ↗"}
    </button>
  );
}
