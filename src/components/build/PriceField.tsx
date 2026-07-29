"use client";

import { useBuild } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";

/**
 * Price input, pre-filled from poe.ninja and editable.
 *
 * The live quote is the default; typing turns the field into a manual override
 * that survives share links (the page only persists overrides, never the live
 * number, so an old link can't freeze a stale price). "Reset" drops back to
 * live. Approximate quotes are marked — a level-20 tier standing in for a
 * level-19 gem must not read as that gem's price.
 */
export function PriceField({ itemKey, fieldId }: { itemKey: string; fieldId: string }) {
  const { getPrice, getOverride, setPrice, clearOverride, getQuote, pricesLoading } = useBuild();
  const quote = getQuote(itemKey);
  const override = getOverride(itemKey);
  const hasOverride = override !== "";
  const hasQuote = quote?.divine !== null && quote?.divine !== undefined;

  const status = (): { text: string; className: string; title?: string } | null => {
    if (hasOverride) return { text: "manual", className: "text-accent-2" };
    if (pricesLoading && !hasQuote) return { text: "pricing…", className: "text-muted" };
    if (!hasQuote) {
      return {
        text: "no live price",
        className: "text-muted",
        title:
          quote?.source === "none" && quote?.icon
            ? "Rares are priced by their rolls — use the trade link below."
            : "poe.ninja has no listing for this item.",
      };
    }
    if (quote?.approx) {
      return { text: "≈ ninja", className: "text-amber-400/90", title: quote.note };
    }
    return {
      text: "ninja",
      className: "text-muted",
      title: quote?.listings !== null ? `${quote?.listings} listings` : undefined,
    };
  };

  const s = status();

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3">
      <label htmlFor={fieldId} className="text-xs text-muted">
        Price
      </label>
      <input
        id={fieldId}
        type="number"
        min="0"
        step="0.1"
        inputMode="decimal"
        value={getPrice(itemKey)}
        onChange={(e) => setPrice(itemKey, e.target.value)}
        placeholder="0"
        className={`w-24 rounded-[6px] border bg-bg px-2 py-1 text-sm outline-none transition-colors focus:border-accent ${
          hasOverride ? "border-accent-2/60 text-text" : "border-border text-text/90"
        }`}
      />
      <DivineIcon />
      {s && (
        <span className={`text-[11px] ${s.className}`} title={s.title}>
          {s.text}
        </span>
      )}
      {hasOverride && hasQuote && (
        <button
          type="button"
          onClick={() => clearOverride(itemKey)}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
          title="Drop the manual price and use the live poe.ninja price"
        >
          Reset
        </button>
      )}
    </div>
  );
}
