"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { ItemSetView, ParsedItem } from "@/types/item";
import { useBuild, formatDivine } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";
import { GearSlot } from "./GearSlot";
import { ItemCard } from "./ItemCard";

/**
 * Equipment laid out the way the game shows it, so a build reads at a glance
 * instead of as a list of cards. Clicking a slot opens that item's full card
 * beside the doll (below it on narrow screens).
 *
 * The grid mirrors the in-game panel: weapons flanking a central body armour,
 * helmet and amulet on top, belt between the rings, gloves and boots at the
 * bottom. Slot names are PoB's own (see lib/pob/categorize.ts); the placement
 * itself lives in the `.paper-doll` rules in globals.css, which need a media
 * query to fall back to a two-up flow on phones.
 */
/** `tall` marks the row-spanning slots, which stack their art above the name so
 *  the extra height reads as the game's big weapon/armour cells, not dead space. */
const LAYOUT: Array<{ slot: string; label: string; area: string; tall?: boolean }> = [
  { slot: "Weapon 1", label: "Weapon", area: "w1", tall: true },
  { slot: "Helmet", label: "Helmet", area: "helm" },
  { slot: "Amulet", label: "Amulet", area: "amu" },
  { slot: "Weapon 2", label: "Offhand", area: "w2", tall: true },
  { slot: "Body Armour", label: "Body", area: "body", tall: true },
  { slot: "Ring 1", label: "Ring", area: "r1" },
  { slot: "Ring 2", label: "Ring", area: "r2" },
  { slot: "Gloves", label: "Gloves", area: "glv" },
  { slot: "Belt", label: "Belt", area: "belt" },
  { slot: "Boots", label: "Boots", area: "bts" },
];

/**
 * Each item's share of the group's total cost, so a slot can draw a hairline bar
 * showing where the build's money went. Normalised against the most expensive
 * item rather than the sum, or a single dominant item flattens everything else
 * to an invisible sliver.
 */
function costShares(
  items: ParsedItem[],
  priceOf: (item: ParsedItem) => number,
): Map<ParsedItem, number> {
  const prices = items.map(priceOf);
  const peak = Math.max(0, ...prices);
  const out = new Map<ParsedItem, number>();
  if (peak <= 0) return out;
  items.forEach((item, i) => out.set(item, prices[i] / peak));
  return out;
}

/** Anything not in the fixed doll layout (swap weapons, unrecognised slots). */
function extraGear(gear: ParsedItem[]): ParsedItem[] {
  const placed = new Set(LAYOUT.map((l) => l.slot));
  return gear.filter((g) => !g.slot || !placed.has(g.slot));
}

function Strip({
  title,
  items,
  selectedKey,
  onSelect,
}: {
  title: string;
  items: ParsedItem[];
  selectedKey: string | null;
  onSelect: (item: ParsedItem) => void;
}) {
  const { keyFor, sumItems, countUnpriced, getPrice } = useBuild();
  if (items.length === 0) return null;
  const total = sumItems(items);
  const unpriced = countUnpriced(items);
  const shares = costShares(items, (i) => Number.parseFloat(getPrice(keyFor(i)) || "") || 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted">{title}</span>
        <span className="h-px flex-1 bg-border/60" aria-hidden />
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
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <GearSlot
            key={`${title}-${i}`}
            item={item}
            slotLabel={item.slot ?? ""}
            selected={selectedKey === keyFor(item)}
            onSelect={() => onSelect(item)}
            share={shares.get(item) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

export function PaperDoll({ view }: { view: ItemSetView }) {
  const { keyFor, sumItems, countUnpriced, getPrice } = useBuild();
  const [selected, setSelected] = useState<ParsedItem | null>(null);

  const bySlot = useMemo(() => {
    const map = new Map<string, ParsedItem>();
    for (const item of view.gear) if (item.slot && !map.has(item.slot)) map.set(item.slot, item);
    return map;
  }, [view.gear]);

  const extras = useMemo(() => extraGear(view.gear), [view.gear]);
  const equipped = view.gear;
  const total = sumItems(equipped);
  const unpriced = countUnpriced(equipped);
  const selectedKey = selected ? keyFor(selected) : null;
  const gearShares = costShares(equipped, (i) => Number.parseFloat(getPrice(keyFor(i)) || "") || 0);

  // Numbering matches the list view's reading order so the two agree.
  const numberOf = (item: ParsedItem): number => {
    const all = [...view.gear, ...view.jewels, ...view.flasks, ...view.charms];
    return all.indexOf(item) + 1;
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-lg text-accent">Equipment</h3>
          <span className="h-px flex-1 bg-border" aria-hidden />
          {total > 0 && (
            <span className="flex items-center gap-1 text-sm text-text">
              {formatDivine(total)} <DivineIcon />
            </span>
          )}
          {unpriced > 0 && (
            <span
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
              title="No live price — rares are priced by their rolls"
            >
              {unpriced} unpriced
            </span>
          )}
        </div>

        <div className="doll-panel">
          <div className="paper-doll">
            {LAYOUT.map(({ slot, label, area, tall }) => {
              const item = bySlot.get(slot) ?? null;
              return (
                <GearSlot
                  key={slot}
                  item={item}
                  slotLabel={label}
                  selected={selectedKey !== null && selectedKey === keyOrNull(item, keyFor)}
                  onSelect={() => {
                    if (item) setSelected((prev) => (prev === item ? null : item));
                  }}
                  share={item ? (gearShares.get(item) ?? 0) : 0}
                  tall={tall}
                  style={{ "--slot-area": area } as CSSProperties}
                />
              );
            })}
          </div>
        </div>

        <Strip
          title="Flasks"
          items={view.flasks}
          selectedKey={selectedKey}
          onSelect={(i) => setSelected((prev) => (prev === i ? null : i))}
        />
        <Strip
          title="Jewels"
          items={view.jewels}
          selectedKey={selectedKey}
          onSelect={(i) => setSelected((prev) => (prev === i ? null : i))}
        />
        <Strip
          title="Charms"
          items={view.charms}
          selectedKey={selectedKey}
          onSelect={(i) => setSelected((prev) => (prev === i ? null : i))}
        />
        <Strip
          title="Other"
          items={extras}
          selectedKey={selectedKey}
          onSelect={(i) => setSelected((prev) => (prev === i ? null : i))}
        />
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[23rem]">
        {selected ? (
          <ItemCard item={selected} number={numberOf(selected)} />
        ) : (
          <p className="rounded-[var(--radius)] border border-dashed border-border bg-surface/40 px-4 py-8 text-center text-sm text-muted">
            Pick a slot to see its mods, price and trade search.
          </p>
        )}
      </aside>
    </div>
  );
}

function keyOrNull(
  item: ParsedItem | null | undefined,
  keyFor: (i: ParsedItem) => string,
): string | null {
  return item ? keyFor(item) : null;
}
