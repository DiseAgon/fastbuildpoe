"use client";

import { useState } from "react";
import type { GemGroup } from "@/types/item";
import { ItemCard } from "./ItemCard";
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

/** One linked socket group — collapses independently so you can check one at a time. */
function GemGroupBlock({ group, startNumber }: { group: GemGroup; startNumber: number }) {
  const { sumItems } = useBuild();
  const [open, setOpen] = useState(false);
  const total = sumItems(group.gems);

  return (
    <div className="rounded-[var(--radius)] border border-border/60 bg-surface/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Chevron open={open} />
        <span className="font-serif text-rarity-gem">{group.label}</span>
        {group.slot && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">{group.slot}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          {total > 0 && (
            <span className="flex items-center gap-1 text-text">
              {formatDivine(total)} <DivineIcon />
            </span>
          )}
          {group.gems.length} gem{group.gems.length === 1 ? "" : "s"}
        </span>
      </button>

      {!open ? (
        <p className="truncate px-3 pb-2 pl-8 text-xs text-muted" title={group.gems.map((g) => g.name).join(", ")}>
          {group.gems.map((g) => g.name).join(", ")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-3 pt-0 md:grid-cols-2">
          {group.gems.map((gem, i) => (
            <ItemCard key={i} item={gem} number={startNumber + i} />
          ))}
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
  const { sumItems } = useBuild();
  const [open, setOpen] = useState(defaultOpen);

  const totalGems = groups.reduce((sum, g) => sum + g.gems.length, 0);
  if (totalGems === 0) return null;

  const total = sumItems(groups.flatMap((g) => g.gems));

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
