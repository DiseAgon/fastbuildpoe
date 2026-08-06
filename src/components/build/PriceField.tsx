"use client";

import { useEffect, useState } from "react";
import { useBuild } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";

/** Digits with at most one decimal point; anything else is dropped as typed. */
function sanitize(raw: string): string {
  return raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

/**
 * Price input, pre-filled from poe.ninja and editable.
 *
 * The live quote is the default; typing turns the field into a manual override
 * that survives share links (the page only persists overrides, never the live
 * number, so an old link can't freeze a stale price). "Reset" drops back to
 * live. Approximate quotes are marked — a level-20 tier standing in for a
 * level-19 gem must not read as that gem's price.
 *
 * While the field is being edited its text is held locally. An empty override
 * means "use the live price", so a fully-controlled field snapped straight back
 * to the quote the moment you cleared it: clearing 67 to type 89 refilled the
 * box with 67 and left you with 689. The local draft lets the field sit empty
 * until you are done, and blur hands control back to the model — where empty
 * still means "use the live price".
 */
export function PriceField({ itemKey, fieldId }: { itemKey: string; fieldId: string }) {
  const { getPrice, getOverride, setPrice, clearOverride, getQuote, pricesLoading } = useBuild();
  const [draft, setDraft] = useState<string | null>(null);

  // A recycled field must not carry the previous item's half-typed text.
  useEffect(() => setDraft(null), [itemKey]);
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
      return { text: "≈ ninja", className: "text-warn/90", title: quote.note };
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
        // Text, not number: a `type="number"` field reports an intermediate
        // entry like "8." as an empty value, which reads here as "no override"
        // and fights the typist for the same reason clearing it did.
        type="text"
        inputMode="decimal"
        value={draft ?? getPrice(itemKey)}
        onChange={(e) => {
          const next = sanitize(e.target.value);
          setDraft(next);
          setPrice(itemKey, next);
        }}
        onBlur={() => setDraft(null)}
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
          onClick={() => {
            setDraft(null);
            clearOverride(itemKey);
          }}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accent"
          title="Drop the manual price and use the live poe.ninja price"
        >
          Reset
        </button>
      )}
    </div>
  );
}
