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
    body: "Open Configure trade search to choose Budget / Similar / Exact / Upgrade, broaden the base, tune properties and modifiers, or replace overlapping raw mods with one pseudo total.",
  },
  {
    title: "Note prices & share",
    body: "Type the price you find into each item's box to get per-group and grand totals in Divine. Then hit Share ↗ to copy a link (build + your prices) to send to others.",
  },
];

export function HowToUse() {
  return (
    <details
      open
      className="rounded-[var(--radius)] border border-border bg-surface/40 p-4"
    >
      <summary className="cursor-pointer font-serif text-lg text-accent">How to use</summary>
      <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
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
    </details>
  );
}
