"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fbp-howto-open";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pick game & league",
    body: "Choose PoE 1 / PoE 2 and your league (top-right). Each game keeps its own session.",
  },
  {
    title: "Import your build",
    body: "Paste a pobb.in link (or a Path of Building export code) and hit Import. New to PoB? Open your build on pobb.in and copy its link.",
  },
  {
    title: "Browse items by group",
    body: "Items are grouped into Gear, Jewels, Gems, Flasks and Charms. Click a group to expand it — each item is numbered so you can track what you've checked.",
  },
  {
    title: "Open a trade search",
    body: "On any item, click “Open trade search ↗” to find similar items on the official trade site. It defaults to Instant Buyout and a forgiving “similar item” search (not an exact copy).",
  },
  {
    title: "Tune the search",
    body: "Use Min-max / As-is / Budget presets, or “⚙ Customize mods” to set each mod to Must / Any / Exclude, edit min–max, mark fractured, add pseudo Totals (total resistance/attributes), or weapon DPS / armour filters. Toggle Buy-out and Base as needed.",
  },
  {
    title: "Note prices & share",
    body: "Type the price you find into each item's box to get per-group and grand totals in Divine. Then hit Share ↗ to copy a link (build + your prices) to send to others.",
  },
];

export function HowToUse() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "0") setOpen(false);
  }, []);

  function toggle() {
    setOpen((v) => {
      window.localStorage.setItem(STORAGE_KEY, v ? "0" : "1");
      return !v;
    });
  }

  return (
    <section
      aria-label="How to use"
      className="rounded-[var(--radius)] border border-border bg-surface/40 p-4"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 text-left"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-[var(--duration-fast)] ${open ? "rotate-90" : ""}`}
        >
          <path d="M5 3l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="font-serif text-lg text-accent">How to use</h2>
        <span className="ml-auto text-xs text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-xs font-medium text-accent">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-text">{step.title}</p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
