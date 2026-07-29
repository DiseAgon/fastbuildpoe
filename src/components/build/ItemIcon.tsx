"use client";

import type { ItemCategory, Rarity } from "@/types/item";
import { RARITY_BORDER_CLASS } from "@/lib/rarity";

/**
 * Item artwork from poe.ninja's CDN URLs. Uniques and gems carry their own art;
 * rares and magic/normal fall back to their base type's art, which is the same
 * image the game uses.
 *
 * Some items have no artwork available at all — most visibly magic flasks. No
 * poe.ninja category carries plain flask base art (BaseType has tinctures but
 * no flasks), and the CDN URLs are HMAC-signed so they cannot be constructed.
 * Those get a category-shaped silhouette, which reads as "no art for this kind
 * of item" rather than as a failed image.
 */

/** Silhouette per category, so an art-less item still looks deliberate. */
const GLYPH: Record<ItemCategory, string> = {
  // Flask/tincture outline.
  flask: "M9.5 3h5v2.2l2 3.4V20a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V8.6l2-3.4V3z",
  // Faceted jewel.
  jewel: "M12 3l7 5-7 13-7-13 7-5z",
  // Socketed gem.
  gem: "M12 3l6 4.5v9L12 21l-6-4.5v-9L12 3z",
  // Charm.
  charm: "M12 21s-7-4.6-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 3.5C19 16.4 12 21 12 21z",
  // Generic equipment crate.
  gear: "M4 7l8-4 8 4v10l-8 4-8-4V7z",
};
export function ItemIcon({
  icon,
  rarity,
  category = "gear",
  alt,
  size = 44,
  bare = false,
}: {
  icon: string | null;
  rarity: Rarity;
  /** Picks the fallback silhouette when no artwork exists. */
  category?: ItemCategory;
  alt: string;
  size?: number;
  /** Drop the bordered plate — for callers that already draw one (paper doll). */
  bare?: boolean;
}) {
  const box = { width: size, height: size };
  const plate = bare ? "" : `rounded-md border bg-bg/60 ${RARITY_BORDER_CLASS[rarity]}`;
  if (!icon) {
    return (
      <span
        style={box}
        className={`grid shrink-0 place-items-center ${plate}`}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-[55%] w-[55%] text-muted/45" aria-hidden>
          <path d={GLYPH[category]} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      style={box}
      className={`grid shrink-0 place-items-center overflow-hidden ${plate}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icon}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
