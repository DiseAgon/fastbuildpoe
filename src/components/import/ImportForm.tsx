"use client";

import { useState } from "react";

export function ImportForm({
  onImport,
  onClear,
  canClear,
  loading,
  initialValue = "",
}: {
  onImport: (input: string) => void;
  onClear: () => void;
  canClear: boolean;
  loading: boolean;
  /** Pre-fills the field when a build is restored from autosave or a share link. */
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !loading) {
      onImport(trimmed);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="pob-input" className="text-sm text-muted">
        Paste a <span className="text-accent">pobb.in</span> link or a Path of Building export code
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="pob-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://pobb.in/xxxxxxxx"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 rounded-[var(--radius)] border border-border bg-surface px-4 py-3 text-text outline-none transition-colors duration-[var(--duration-fast)] placeholder:text-muted/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading || value.trim() === ""}
          className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-6 py-3 font-medium text-accent transition-colors duration-[var(--duration-fast)] hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Importing…" : "Import build"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className="rounded-[var(--radius)] border border-border bg-surface px-4 py-3 text-sm text-muted transition-colors duration-[var(--duration-fast)] hover:border-danger/50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
          title="Clear this game's active build, input and prices"
        >
          Clear session
        </button>
      </div>
    </form>
  );
}
