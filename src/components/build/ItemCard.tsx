"use client";

import type { ParsedItem } from "@/types/item";
import {
  MOD_TYPE_CLASS,
  MOD_TYPE_LABEL,
  RARITY_BORDER_CLASS,
  RARITY_TEXT_CLASS,
} from "@/lib/rarity";
import { useBuild } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";
import { TradeLinkButton } from "./TradeLinkButton";
import { GemTradeControls } from "./GemTradeControls";

export function ItemCard({ item, number }: { item: ParsedItem; number: number }) {
  const { getPrice, setPrice, keyFor } = useBuild();
  const priceKey = keyFor(item);
  // Sanitize for use as a DOM id (item keys contain spaces, "|", "%", etc.).
  const priceFieldId = `price-${priceKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const showBase = item.baseType && item.baseType !== item.name;
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
        <div className="min-w-0 flex-1">
          <h3
            className={`truncate font-serif text-lg leading-tight ${RARITY_TEXT_CLASS[item.rarity]}`}
            title={item.name}
          >
            {item.name}
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
        {item.corrupted && <span className="text-red-400">Corrupted</span>}
      </div>

      {!isGem && (
        <ul className="flex-1 space-y-1 px-4 py-3 text-sm">
          {item.mods.length === 0 && <li className="text-muted">No mods parsed.</li>}
          {item.mods.map((mod, i) => (
            <li key={i} className="flex gap-2">
              <span
                className={`mt-0.5 shrink-0 text-[10px] uppercase tracking-wide ${MOD_TYPE_CLASS[mod.type]}`}
                title={MOD_TYPE_LABEL[mod.type]}
              >
                {MOD_TYPE_LABEL[mod.type].slice(0, 3)}
              </span>
              <span className="text-text/90">{mod.text}</span>
            </li>
          ))}
        </ul>
      )}

      {item.unparsed.length > 0 && (
        <p className="px-4 py-2 text-xs text-amber-400/80">
          {item.unparsed.length} line(s) not parsed
        </p>
      )}

      <div className="mt-auto border-t border-border/60">
        <div className="flex items-center gap-2 px-4 pt-3">
          <label htmlFor={priceFieldId} className="text-xs text-muted">
            Price
          </label>
          <input
            id={priceFieldId}
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={getPrice(priceKey)}
            onChange={(e) => setPrice(priceKey, e.target.value)}
            placeholder="0"
            className="w-24 rounded-[6px] border border-border bg-bg px-2 py-1 text-sm text-text outline-none transition-colors focus:border-accent"
          />
          <DivineIcon />
        </div>
        {isGem ? <GemTradeControls item={item} /> : <TradeLinkButton item={item} />}
      </div>
    </article>
  );
}
