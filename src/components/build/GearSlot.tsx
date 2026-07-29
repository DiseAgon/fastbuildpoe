"use client";

import type { CSSProperties } from "react";
import type { ParsedItem } from "@/types/item";
import { RARITY_TEXT_CLASS } from "@/lib/rarity";
import { useBuild, formatDivine } from "./BuildContext";
import { ItemIcon } from "./ItemIcon";

/**
 * One equipment slot on the paper doll: artwork on a socket plate, the item's
 * name in its rarity colour, and its live price.
 *
 * An empty slot still renders — a gap in the doll is information ("this build
 * runs no shield"), so it stays an empty socket rather than collapsing the grid.
 * Presentation lives in the `.gear-slot` rules in globals.css; the rarity comes
 * through as `data-rarity` so one CSS variable tints the border, wash, plate
 * ring and cost bar together.
 */
export function GearSlot({
  item,
  slotLabel,
  selected,
  onSelect,
  /** This item's share of its group's cost (0–1), drawn as a hairline bar. */
  share = 0,
  /** Row-spanning slot: stacks art above the name and uses larger artwork. */
  tall = false,
  className = "",
  style,
}: {
  item: ParsedItem | null;
  slotLabel: string;
  selected: boolean;
  onSelect: () => void;
  share?: number;
  tall?: boolean;
  className?: string;
  /** Used by the paper doll to place the cell into its named grid area. */
  style?: CSSProperties;
}) {
  const { keyFor, getQuote, getPrice } = useBuild();

  if (!item) {
    return (
      <div style={style} data-tall={tall} className={`gear-slot--empty ${className}`}>
        {slotLabel}
      </div>
    );
  }

  const key = keyFor(item);
  const quote = getQuote(key);
  const price = Number.parseFloat(getPrice(key) || "");
  const hasPrice = Number.isFinite(price) && price > 0;
  const displayName = item.name === "New Item" ? item.baseType : item.name;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-rarity={item.rarity}
      data-tall={tall}
      title={`${displayName} — ${item.baseType}`}
      style={{ ...style, "--slot-share": share } as CSSProperties}
      className={`gear-slot ${className}`}
    >
      <span className="gear-slot__plate">
        <ItemIcon
          icon={quote?.icon ?? null}
          rarity={item.rarity}
          category={item.category}
          alt={displayName}
          size={tall ? 54 : 36}
          bare
        />
      </span>

      <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
        {slotLabel && (
          <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted/70">
            {slotLabel}
          </span>
        )}
        <span
          className={`gear-slot__name line-clamp-2 text-xs font-semibold leading-snug ${RARITY_TEXT_CLASS[item.rarity]}`}
        >
          {displayName}
        </span>
        {hasPrice && (
          <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted">
            {formatDivine(price)} div
          </span>
        )}
      </span>

      {share > 0 && <span className="gear-slot__bar" aria-hidden />}
    </button>
  );
}
