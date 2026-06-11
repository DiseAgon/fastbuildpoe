"use client";

import { useEffect, useState } from "react";
import type { GameId } from "@/lib/game/registry";
import type { ParsedBuild } from "@/types/item";

interface Status {
  enabled: boolean;
  signedIn: boolean;
}

/**
 * "Sign in with Path of Exile" + character import. Renders nothing unless the
 * OAuth client is configured server-side (POE_OAUTH_* env), so it stays dormant
 * on deployments without credentials. See OAUTH_SETUP.md.
 */
export function SignInPoe({
  game,
  onLoad,
}: {
  game: GameId;
  onLoad: (build: ParsedBuild) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [characters, setCharacters] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/poe/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, signedIn: false }));
  }, []);

  useEffect(() => {
    if (!status?.signedIn) return;
    fetch("/api/build/characters")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setCharacters(j.data as string[]);
          setSelected((j.data as string[])[0] ?? "");
        } else {
          setError(j.error ?? "Could not list characters.");
        }
      })
      .catch(() => setError("Could not list characters."));
  }, [status?.signedIn]);

  if (!status?.enabled) return null;

  if (!status.signedIn) {
    return (
      <div className="mt-3 border-t border-border/60 pt-3">
        <a
          href="/api/auth/poe/login"
          className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
        >
          Sign in with Path of Exile
        </a>
        <span className="ml-2 text-xs text-muted">to import a character directly</span>
      </div>
    );
  }

  async function load() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/build/character", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selected, game }),
      });
      const json = await res.json();
      if (json.success && json.data) onLoad(json.data as ParsedBuild);
      else setError(json.error ?? "Failed to load character.");
    } catch {
      setError("Failed to load character.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
      <span className="text-sm text-muted">Or import a character:</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-[6px] border border-border bg-surface px-2 py-1 text-sm text-text outline-none focus:border-accent"
      >
        {characters.length === 0 && <option value="">No characters</option>}
        {characters.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={load}
        disabled={loading || !selected}
        className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-3 py-1 text-sm text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
      >
        {loading ? "Loading…" : "Load"}
      </button>
      <button
        type="button"
        onClick={() => fetch("/api/auth/poe/logout", { method: "POST" }).then(() => location.reload())}
        className="text-xs text-muted hover:text-text"
      >
        Sign out
      </button>
      {error && (
        <span className="w-full text-xs text-red-400" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
