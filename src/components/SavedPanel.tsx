"use client";

import type { SavedSession } from "@/lib/sessions";
import { formatDivine } from "@/components/build/BuildContext";

export function SavedPanel({
  open,
  onClose,
  sessions,
  onLoad,
  onDelete,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  sessions: SavedSession[];
  onLoad: (s: SavedSession) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" aria-label="Saved builds">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col border-l border-border bg-surface shadow-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-serif text-lg text-accent">Saved builds</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-text">
            ✕
          </button>
        </header>

        {sessions.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No saved builds yet. Import a build, note prices, then hit “Save” to keep it here.
          </p>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border/60 overflow-y-auto">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onLoad(s)}
                      className="min-w-0 flex-1 text-left"
                      title="Load this build"
                    >
                      <span className="block truncate text-sm font-medium text-text hover:text-accent">
                        {s.label}
                      </span>
                      <span className="text-xs text-muted">
                        {s.game === "poe1" ? "PoE 1" : "PoE 2"}
                        {s.total > 0 ? ` · ${formatDivine(s.total)} div` : ""} ·{" "}
                        {new Date(s.savedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      className="shrink-0 text-xs text-muted hover:text-red-400"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-muted hover:text-red-400"
              >
                Clear all
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
