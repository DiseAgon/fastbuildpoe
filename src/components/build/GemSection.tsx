"use client";

import { Fragment, useState } from "react";
import type { GemGroup, ParsedItem } from "@/types/item";
import { ItemCard } from "./ItemCard";
import { GearSlot } from "./GearSlot";
import { useBuild, formatDivine } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-[var(--duration-fast)] ${open ? "rotate-90" : ""}`}
    >
      <path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Level / quality is the useful eyebrow for a gem, the way a slot name is for gear. */
function gemLabel(gem: ParsedItem): string {
  const parts = [`Lv ${gem.gemLevel ?? "?"}`];
  if (gem.quality) parts.push(`Q${gem.quality}%`);
  if (gem.corrupted) parts.push("corr");
  return parts.join(" · ");
}

/**
 * Each item's share of the group's cost, matching the equipment panel: scaled
 * against the priciest gem so one expensive support doesn't flatten the rest.
 */
function shareMap(
  gems: ParsedItem[],
  priceOf: (gem: ParsedItem) => number,
): Map<ParsedItem, number> {
  const prices = gems.map(priceOf);
  const peak = Math.max(0, ...prices);
  const out = new Map<ParsedItem, number>();
  if (peak <= 0) return out;
  gems.forEach((gem, i) => out.set(gem, prices[i] / peak));
  return out;
}

/**
 * One linked socket group, drawn the way the game shows it: sockets in a tray,
 * joined by link bars. Clicking a socket opens that gem's full card underneath —
 * kept inside the group rather than in a shared side panel, so the section works
 * the same in both the paper-doll and list views.
 */
function GemGroupBlock({ group, startNumber }: { group: GemGroup; startNumber: number }) {
  const { sumItems, countUnpriced, keyFor, getPrice } = useBuild();
  const [selected, setSelected] = useState<ParsedItem | null>(null);
  const total = sumItems(group.gems);
  const unpriced = countUnpriced(group.gems);
  const shares = shareMap(group.gems, (g) => Number.parseFloat(getPrice(keyFor(g)) || "") || 0);
  const selectedKey = selected ? keyFor(selected) : null;

  return (
    <div className="gem-group p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 pb-2">
        <span className="font-serif text-sm text-rarity-gem">{group.label}</span>
        {group.slot && (
          <span className="rounded-full border border-border bg-surface/70 px-2 py-0.5 text-[10px] text-muted">
            {group.slot}
          </span>
        )}
        <span className="h-px min-w-4 flex-1 bg-border/60" aria-hidden />
        {total > 0 && (
          <span className="flex items-center gap-1 text-xs text-text">
            {formatDivine(total)} <DivineIcon />
          </span>
        )}
        {unpriced > 0 && (
          <span className="text-[10px] text-muted" title="No live price for these">
            {unpriced} unpriced
          </span>
        )}
        <span className="text-[10px] text-muted">
          {group.gems.length} gem{group.gems.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="gem-sockets">
        {group.gems.map((gem, i) => {
          const socket = (
            <GearSlot
              item={gem}
              slotLabel={gemLabel(gem)}
              selected={selectedKey === keyFor(gem)}
              onSelect={() => setSelected((prev) => (prev === gem ? null : gem))}
              share={shares.get(gem) ?? 0}
            />
          );
          return i === 0 ? (
            <Fragment key={i}>{socket}</Fragment>
          ) : (
            <span key={i} className="gem-pair">
              <span className="gem-link" aria-hidden />
              {socket}
            </span>
          );
        })}
      </div>

      {selected && (
        <div className="pt-2.5">
          <ItemCard item={selected} number={startNumber + group.gems.indexOf(selected)} />
        </div>
      )}
    </div>
  );
}

export function GemSection({
  groups,
  startNumber,
  defaultOpen = false,
}: {
  groups: GemGroup[];
  startNumber: number;
  defaultOpen?: boolean;
}) {
  const { sumItems, countUnpriced } = useBuild();
  const [open, setOpen] = useState(defaultOpen);

  const totalGems = groups.reduce((sum, g) => sum + g.gems.length, 0);
  if (totalGems === 0) return null;

  const allGems = groups.flatMap((g) => g.gems);
  const total = sumItems(allGems);
  const unpriced = countUnpriced(allGems);

  // Running start number across groups (kept stable whether a group is open or not).
  let counter = startNumber;

  return (
    <section aria-label="Gems" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-3 text-left"
      >
        <Chevron open={open} />
        <h3 className="font-serif text-lg text-accent transition-colors group-hover:text-accent-soft">Gems</h3>
        <span className="h-px flex-1 bg-border" aria-hidden />
        {total > 0 && (
          <span className="flex items-center gap-1 text-sm text-text">
            {formatDivine(total)} <DivineIcon />
          </span>
        )}
        {unpriced > 0 && (
          <span
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
            title="No live price for these gems"
          >
            {unpriced} unpriced
          </span>
        )}
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
          {groups.length} link{groups.length === 1 ? "" : "s"} · {totalGems}
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {groups.map((group, gi) => {
            const start = counter;
            counter += group.gems.length;
            return <GemGroupBlock key={gi} group={group} startNumber={start} />;
          })}
        </div>
      )}
    </section>
  );
}
