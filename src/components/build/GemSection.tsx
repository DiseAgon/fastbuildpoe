"use client";

import { useState } from "react";
import type { GemGroup } from "@/types/item";
import { ItemCard } from "./ItemCard";
import { useBuild, formatDivine } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";

export function GemSection({
  groups,
  startNumber,
  defaultOpen = false,
}: {
  groups: GemGroup[];
  startNumber: number;
  defaultOpen?: boolean;
}) {
  const { sumItems } = useBuild();
  const [open, setOpen] = useState(defaultOpen);

  const totalGems = groups.reduce((sum, g) => sum + g.gems.length, 0);
  if (totalGems === 0) return null;

  const allGems = groups.flatMap((g) => g.gems);
  const total = sumItems(allGems);

  // Continuous numbering across every gem in every group.
  let counter = startNumber;

  return (
    <section aria-label="Gems" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-3 text-left"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-[var(--duration-fast)] ${
            open ? "rotate-90" : ""
          }`}
        >
          <path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3 className="font-serif text-lg text-accent transition-colors group-hover:text-accent-soft">
          Gems
        </h3>
        <span className="h-px flex-1 bg-border" aria-hidden />
        {total > 0 && (
          <span className="flex items-center gap-1 text-sm text-text">
            {formatDivine(total)} <DivineIcon />
          </span>
        )}
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
          {groups.length} link{groups.length === 1 ? "" : "s"} · {totalGems}
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-5">
          {groups.map((group, gi) => {
            const groupTotal = sumItems(group.gems);
            return (
              <div
                key={gi}
                className="flex flex-col gap-2 rounded-[var(--radius)] border border-border/60 bg-surface/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-serif text-rarity-gem">{group.label}</span>
                  {group.slot && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      {group.slot}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                    {groupTotal > 0 && (
                      <span className="flex items-center gap-1 text-text">
                        {formatDivine(groupTotal)} <DivineIcon />
                      </span>
                    )}
                    {group.gems.length} gem{group.gems.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {group.gems.map((gem, i) => (
                    <ItemCard key={i} item={gem} number={counter++} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
