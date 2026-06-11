"use client";

import { useBuild } from "./BuildContext";

/** Divine Orb icon for the active game (PoE1 and PoE2 use different art). */
export function DivineIcon({ className = "" }: { className?: string }) {
  const { divineIcon } = useBuild();
  if (!divineIcon) {
    return <span className={`text-xs text-accent ${className}`}>div</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN, sized inline
    <img
      src={divineIcon}
      alt="Divine Orb"
      width={18}
      height={18}
      loading="lazy"
      className={`inline-block h-[18px] w-[18px] align-middle ${className}`}
    />
  );
}
