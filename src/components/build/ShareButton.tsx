"use client";

import { useState } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ItemSetView } from "@/types/item";
import { encodeEmbeddedPrices, encodeShare, shortenBuildInput } from "@/lib/share";
import { buildPriceNotes } from "@/lib/pob/priceNotes";
import { useBuild } from "./BuildContext";

type Status = "idle" | "working" | "copied" | "error";

const LABEL: Record<Status, string> = {
  idle: "Share ↗",
  working: "Building link…",
  copied: "Link copied ✓",
  error: "Copy failed",
};

const POBBIN_ID = /pobb\.in\/([A-Za-z0-9_-]+)/i;

/**
 * Copies a shareable link to the clipboard: the build, the chosen league, and
 * the prices the user wrote down.
 *
 * The prices ride inside a pobb.in paste rather than in the URL. Hand-priced
 * builds put 60-odd item keys into the payload, and even compressed that was
 * most of a ~850-character link; writing them into the paste's PoB Notes
 * instead makes the URL a fixed ~40 characters however much was priced, and the
 * paste doubles as an export the recipient can open in PoB with the price table
 * already in it.
 *
 * If the upload fails the link still gets made, the long way — prices packed
 * into the hash. A long link beats no link.
 */
export function ShareButton({
  game,
  input,
  view,
  league,
  prices,
  title,
}: {
  game: GameId;
  input: string;
  view: ItemSetView;
  league: string;
  prices: Record<string, string>;
  title?: string;
}) {
  const { getPrice, keyFor, sumItems } = useBuild();
  const [status, setStatus] = useState<Status>("idle");

  const canShare = input.trim().length > 0;

  /** Upload a paste carrying both the build and the prices; null if it fails. */
  async function pasteWithPrices(gamePrices: Record<string, string>): Promise<string | null> {
    try {
      const data = await encodeEmbeddedPrices({
        v: 1,
        game,
        setId: view.id,
        league,
        prices: gamePrices,
      });
      const notes = buildPriceNotes(view, getPrice, keyFor, sumItems, data);
      const res = await fetch("/api/build/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, notes, title: title ?? "FastBuildPOE price check" }),
      });
      const json = await res.json();
      const url: string | null = json?.data?.pobbinUrl ?? null;
      return url?.match(POBBIN_ID)?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async function handleShare() {
    setStatus("working");
    try {
      // Only this game's non-empty prices.
      const gamePrices = Object.fromEntries(
        Object.entries(prices).filter(([k, v]) => k.startsWith(`${game}|`) && v !== ""),
      );

      const pasteId = await pasteWithPrices(gamePrices);
      let hash: string;
      if (pasteId) {
        hash = `#p=${pasteId}`;
      } else {
        const ref = await shortenBuildInput(input, title);
        const encoded = await encodeShare({
          v: 1,
          game,
          input: ref,
          setId: view.id,
          league,
          prices: gamePrices,
        });
        hash = `#s=${encoded}`;
      }

      await navigator.clipboard.writeText(
        `${window.location.origin}${window.location.pathname}${hash}`,
      );
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  }

  if (!canShare) return null;

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={status === "working"}
      title="Copy a short link to this build and its prices. The build and prices are uploaded to pobb.in as a public paste, which is what keeps the link short."
      className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1 text-sm text-muted transition-colors duration-[var(--duration-fast)] hover:border-accent/50 hover:text-accent disabled:opacity-50"
    >
      {LABEL[status]}
    </button>
  );
}
