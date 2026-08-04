"use client";

import type { ParsedItem } from "@/types/item";
import { RARITY_BORDER_CLASS, RARITY_TEXT_CLASS } from "@/lib/rarity";
import { useTradeSelection } from "@/hooks/useTradeSelection";
import { useBuild } from "./BuildContext";
import { ItemIcon } from "./ItemIcon";
import { ModList } from "./ModList";
import { PriceField } from "./PriceField";
import { TradeLinkButton } from "./TradeLinkButton";
import { GemTradeControls } from "./GemTradeControls";

/**
 * Mods + trade controls for equipment, split out so `useTradeSelection` only
 * runs for items that have a mod-based trade search. Gems take a different path
 * (level/quality), and a hook can't be called conditionally.
 */
function GearTradeSection({
  item,
  priceKey,
  priceFieldId,
}: {
  item: ParsedItem;
  priceKey: string;
  priceFieldId: string;
}) {
  const { game, league } = useBuild();
  const trade = useTradeSelection(game, league, item);

  return (
    <>
      <ModList item={item} trade={trade} />

      {item.unparsed.length > 0 && (
        <p className="px-4 py-2 text-xs text-warn/80">
          {item.unparsed.length} line(s) not parsed
        </p>
      )}

      <div className="mt-auto border-t border-border/60">
        <PriceField itemKey={priceKey} fieldId={priceFieldId} />
        <TradeLinkButton item={item} trade={trade} />
      </div>
    </>
  );
}

export function ItemCard({ item, number }: { item: ParsedItem; number: number }) {
  const { keyFor, getQuote } = useBuild();
  const priceKey = keyFor(item);
  const quote = getQuote(priceKey);
  // Sanitize for use as a DOM id (item keys contain spaces, "|", "%", etc.).
  const priceFieldId = `price-${priceKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  // PoB names crafted items "New Item" — the base type is the useful label.
  const displayName = item.name === "New Item" ? item.baseType : item.name;
  const showBase = item.baseType && item.baseType !== displayName;
  const isGem = item.category === "gem";

  return (
    <article
      className={`group flex flex-col rounded-[var(--radius)] border bg-surface shadow-card transition-colors duration-[var(--duration-fast)] hover:bg-surface-raised ${RARITY_BORDER_CLASS[item.rarity]}`}
    >
      <header className="flex items-start gap-3 border-b border-border/60 px-4 py-3">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-xs font-medium text-muted"
          aria-hidden
        >
          {number}
        </span>
        <ItemIcon icon={quote?.icon ?? null} rarity={item.rarity} category={item.category} alt={displayName} />
        <div className="min-w-0 flex-1">
          <h3
            className={`truncate font-serif text-lg leading-tight ${RARITY_TEXT_CLASS[item.rarity]}`}
            title={displayName}
          >
            {displayName}
          </h3>
          {showBase && (
            <p className="truncate text-sm text-muted" title={item.baseType}>
              {item.baseType}
            </p>
          )}
        </div>
        {isGem ? (
          <span className="shrink-0 rounded-md border border-rarity-gem/50 bg-rarity-gem/10 px-2 py-0.5 text-xs font-semibold text-rarity-gem">
            Lv {item.gemLevel ?? "?"}
            {item.quality ? ` · Q${item.quality}%` : ""}
          </span>
        ) : (
          item.slot && (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {item.slot}
            </span>
          )
        )}
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-muted">
        {!isGem && item.itemLevel !== undefined && <span>iLvl {item.itemLevel}</span>}
        {!isGem && item.quality ? <span>Q {item.quality}%</span> : null}
        {item.sockets && <span>{item.sockets}</span>}
        {item.corrupted && <span className="text-danger">Corrupted</span>}
      </div>

      {isGem ? (
        <>
          {item.unparsed.length > 0 && (
            <p className="px-4 py-2 text-xs text-warn/80">
              {item.unparsed.length} line(s) not parsed
            </p>
          )}
          <div className="mt-auto border-t border-border/60">
            <PriceField itemKey={priceKey} fieldId={priceFieldId} />
            <GemTradeControls item={item} />
          </div>
        </>
      ) : (
        <GearTradeSection item={item} priceKey={priceKey} priceFieldId={priceFieldId} />
      )}
    </article>
  );
}
