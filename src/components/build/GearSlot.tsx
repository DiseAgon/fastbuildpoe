"use client";

import type { CSSProperties } from "react";
import type { ParsedItem } from "@/types/item";
import { RARITY_BORDER_CLASS, RARITY_TEXT_CLASS } from "@/lib/rarity";
import { useBuild, formatDivine } from "./BuildContext";
import { ItemIcon } from "./ItemIcon";

/**
 * One equipment slot on the paper doll: artwork, name, and its live price.
 *
 * An empty slot still renders — a gap in the doll is information ("this build
 * runs no shield"), so it keeps its label rather than collapsing the grid.
 */
export function GearSlot({
  item,
  slotLabel,
  selected,
  onSelect,
  className = "",
  style,
}: {
  item: ParsedItem | null;
  slotLabel: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  /** Used by the paper doll to place the cell into its named grid area. */
  style?: CSSProperties;
}) {
  const { keyFor, getQuote, getPrice } = useBuild();

  if (!item) {
    return (
      <div
        style={style}
        className={`flex h-full min-h-[58px] items-center justify-center rounded-md border border-dashed border-border/60 bg-bg/30 px-2 text-center text-[10px] uppercase tracking-wide text-muted/50 ${className}`}
      >
        {slotLabel}
      </div>
    );
  }

  const key = keyFor(item);
  const quote = getQuote(key);
  const price = Number.parseFloat(getPrice(key) || "");
  const displayName = item.name === "New Item" ? item.baseType : item.name;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      aria-pressed={selected}
      title={`${displayName} — ${item.baseType}`}
      className={`group relative flex h-full min-h-[58px] items-center gap-2 overflow-hidden rounded-md border bg-surface px-2 py-1.5 text-left transition-[transform,box-shadow,border-color] duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? "border-accent shadow-glow" : RARITY_BORDER_CLASS[item.rarity]
      } ${className}`}
    >
      <ItemIcon icon={quote?.icon ?? null} rarity={item.rarity} alt={displayName} size={38} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {slotLabel && (
          <span className="text-[9px] uppercase tracking-wide text-muted/70">{slotLabel}</span>
        )}
        <span
          className={`line-clamp-2 text-xs font-medium leading-snug ${RARITY_TEXT_CLASS[item.rarity]}`}
        >
          {displayName}
        </span>
        {Number.isFinite(price) && price > 0 && (
          <span className="text-[10px] tabular-nums text-muted">
            {formatDivine(price)} div
          </span>
        )}
      </span>
    </button>
  );
}
