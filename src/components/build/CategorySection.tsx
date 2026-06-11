"use client";

import { useState } from "react";
import type { ParsedItem } from "@/types/item";
import { ItemCard } from "./ItemCard";
import { useBuild, formatDivine } from "./BuildContext";
import { DivineIcon } from "./DivineIcon";

export function CategorySection({
  label,
  items,
  startNumber,
  defaultOpen = true,
}: {
  label: string;
  items: ParsedItem[];
  /** Display number of the first item in this section (1-based, continues across sections). */
  startNumber: number;
  defaultOpen?: boolean;
}) {
  const { sumItems } = useBuild();
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  const total = sumItems(items);
  const sectionId = `section-${label.toLowerCase()}`;

  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={sectionId}
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
          {label}
        </h3>
        <span className="h-px flex-1 bg-border" aria-hidden />
        {total > 0 && (
          <span className="flex items-center gap-1 text-sm text-text">
            {formatDivine(total)} <DivineIcon />
          </span>
        )}
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
          {items.length}
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div id={sectionId} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((item, i) => (
            <ItemCard key={`${label}-${i}`} item={item} number={startNumber + i} />
          ))}
        </div>
      )}
    </section>
  );
}
