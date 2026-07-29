"use client";

import type { Rarity } from "@/types/item";
import { RARITY_BORDER_CLASS } from "@/lib/rarity";

/**
 * Item artwork from poe.ninja's CDN URLs. Uniques and gems carry their own art;
 * rares and magic/normal fall back to their base type's art, which is the same
 * image the game uses. When nothing matched we draw a rarity-tinted plate
 * rather than a broken image, so the grid keeps its rhythm.
 */
export function ItemIcon({
  icon,
  rarity,
  alt,
  size = 44,
}: {
  icon: string | null;
  rarity: Rarity;
  alt: string;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (!icon) {
    return (
      <span
        style={box}
        className={`grid shrink-0 place-items-center rounded-md border bg-bg/60 ${RARITY_BORDER_CLASS[rarity]}`}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted/50" aria-hidden>
          <path
            d="M4 7l8-4 8 4v10l-8 4-8-4V7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      style={box}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md border bg-bg/60 ${RARITY_BORDER_CLASS[rarity]}`}
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
