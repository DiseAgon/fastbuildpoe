"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportForm } from "@/components/import/ImportForm";
import { SignInPoe } from "@/components/import/SignInPoe";
import { CategorySection } from "@/components/build/CategorySection";
import { GemSection } from "@/components/build/GemSection";
import { BuildProvider, formatDivine, useBuild } from "@/components/build/BuildContext";
import { DivineIcon } from "@/components/build/DivineIcon";
import { ShareButton } from "@/components/build/ShareButton";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game/registry";
import type { ItemSetView, ParsedBuild, ParsedItem } from "@/types/item";
import type { TradeMeta } from "@/lib/trade/meta";
import { decodeShare } from "@/lib/share";

interface ImportResponse {
  success: boolean;
  data: ParsedBuild | null;
  error: string | null;
}

type ByGame<T> = Record<GameId, T>;
const emptyByGame = <T,>(value: T): ByGame<T> => ({ poe1: value, poe2: value });

function allItemsOf(view: ItemSetView): ParsedItem[] {
  return [
    ...view.gear,
    ...view.jewels,
    ...view.gems.flatMap((g) => g.gems),
    ...view.flasks,
    ...view.charms,
  ];
}

/** Grand total of all manually-entered prices in the current view. */
function GrandTotal({ items }: { items: ParsedItem[] }) {
  const { sumItems } = useBuild();
  const total = sumItems(items);
  if (total <= 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-[var(--radius)] border border-accent/40 bg-accent/10 px-3 py-1 text-accent">
      Total {formatDivine(total)} <DivineIcon />
    </span>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameId>("poe1");
  const [builds, setBuilds] = useState<ByGame<ParsedBuild | null>>(emptyByGame(null));
  const [activeSetIds, setActiveSetIds] = useState<ByGame<string>>(emptyByGame(""));
  const [meta, setMeta] = useState<ByGame<TradeMeta | null>>(emptyByGame(null));
  const [leagues, setLeagues] = useState<ByGame<string>>(emptyByGame(""));
  const [inputs, setInputs] = useState<ByGame<string>>(emptyByGame(""));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setPrice = useCallback(
    (key: string, value: string) => setPrices((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const build = builds[game];
  const activeSetId = activeSetIds[game];
  const gameMeta = meta[game];
  const league = leagues[game] || gameMeta?.defaultLeague || "";

  // Load leagues + divine icon for the active game (once per game).
  useEffect(() => {
    if (meta[game]) return;
    let cancelled = false;
    fetch(`/api/trade/meta?game=${game}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success || !json.data) return;
        setMeta((prev) => ({ ...prev, [game]: json.data as TradeMeta }));
        setLeagues((prev) =>
          prev[game] ? prev : { ...prev, [game]: (json.data as TradeMeta).defaultLeague },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [game, meta]);

  const view: ItemSetView | null = useMemo(() => {
    if (!build) return null;
    return build.itemSets.find((s) => s.id === activeSetId) ?? build.itemSets[0] ?? null;
  }, [build, activeSetId]);

  const offsets = useMemo(() => {
    if (!view) return { gear: 1, jewels: 1, gems: 1, flasks: 1, charms: 1, totalGems: 0 };
    const totalGems = view.gems.reduce((sum, g) => sum + g.gems.length, 0);
    const gear = 1;
    const jewels = gear + view.gear.length;
    const gems = jewels + view.jewels.length;
    const flasks = gems + totalGems;
    const charms = flasks + view.flasks.length;
    return { gear, jewels, gems, flasks, charms, totalGems };
  }, [view]);

  const importInput = useCallback(async (input: string): Promise<ParsedBuild | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/build/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const json: ImportResponse = await res.json();
      if (!json.success || !json.data) {
        setError(json.error ?? "Import failed.");
        return null;
      }
      const imported = json.data;
      setBuilds((prev) => ({ ...prev, [imported.game]: imported }));
      setActiveSetIds((prev) => ({ ...prev, [imported.game]: imported.activeItemSetId }));
      setInputs((prev) => ({ ...prev, [imported.game]: input }));
      setGame(imported.game);
      return imported;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  function handleImport(input: string) {
    void importInput(input);
  }

  // Apply a parsed build that didn't come from a pasted input (e.g. character import).
  const applyBuild = useCallback((b: ParsedBuild) => {
    setBuilds((prev) => ({ ...prev, [b.game]: b }));
    setActiveSetIds((prev) => ({ ...prev, [b.game]: b.activeItemSetId }));
    setGame(b.game);
    setError(null);
  }, []);

  // Restore a shared session from the URL hash (#s=...) once on mount.
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash.startsWith("#s=")) return;
    let payload;
    try {
      payload = decodeShare(window.location.hash.slice(3));
    } catch {
      return;
    }
    setPrices((prev) => ({ ...prev, ...payload.prices }));
    setLeagues((prev) => ({ ...prev, [payload.game]: payload.league }));
    setGame(payload.game);
    if (payload.input) {
      void importInput(payload.input).then((b) => {
        if (b) setActiveSetIds((prev) => ({ ...prev, [b.game]: payload.setId }));
      });
    }
  }, [importInput]);

  function switchGame(id: GameId) {
    setGame(id);
    setError(null);
  }

  const total = view
    ? view.gear.length +
      view.jewels.length +
      offsets.totalGems +
      view.flasks.length +
      view.charms.length
    : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div>
          <h1 className="font-serif text-2xl text-accent">FastBuildPOE</h1>
          <p className="text-sm text-muted">Trade-search links for every item in a build.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            {GAME_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => switchGame(id)}
                aria-pressed={game === id}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] ${
                  game === id ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
                }`}
              >
                {id === "poe1" ? "PoE 1" : "PoE 2"}
                {builds[id] ? (
                  <span
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle"
                    aria-label="has a build"
                  />
                ) : null}
              </button>
            ))}
          </div>

          <label className="sr-only" htmlFor="league-input">
            League
          </label>
          <input
            id="league-input"
            list="league-options"
            value={league}
            placeholder={gameMeta ? "League" : "Loading…"}
            onChange={(e) => setLeagues((prev) => ({ ...prev, [game]: e.target.value }))}
            className="w-44 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-accent"
            title="Pick a league or type one (e.g. a private/event league)"
          />
          <datalist id="league-options">
            {gameMeta?.leagues.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
      </header>

      <BuildProvider
        game={game}
        league={league || null}
        divineIcon={gameMeta?.divineIcon ?? null}
        prices={prices}
        onPriceChange={setPrice}
      >
        <main className="flex flex-1 flex-col gap-8 pb-16">
          <section
            aria-label="Import a build"
            className="rounded-[var(--radius)] border border-border bg-surface/60 p-5"
          >
            {/* key={game} remounts the form so the field clears when you switch game. */}
            <ImportForm key={game} onImport={handleImport} loading={loading} />
            {error && (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <SignInPoe game={game} onLoad={applyBuild} />
            <p className="mt-3 text-xs text-muted">
              Viewing <span className="text-text">{GAMES[game].label}</span>
              {league ? <> · league <span className="text-text">{league}</span></> : null}. Each
              game keeps its own session.
            </p>
          </section>

          {build && view ? (
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-serif text-xl">
                    {build.className ?? "Build"}
                    {build.ascendancy ? ` · ${build.ascendancy}` : ""}
                    {build.level ? <span className="text-muted"> · Lv {build.level}</span> : null}
                  </h2>
                  <div className="flex items-center gap-3 text-sm">
                    <GrandTotal items={allItemsOf(view)} />
                    <ShareButton
                      game={game}
                      input={inputs[game]}
                      setId={view.id}
                      league={league}
                      prices={prices}
                    />
                    <span className="text-muted">
                      {total} item{total === 1 ? "" : "s"}
                      {build.skipped > 0 ? ` · ${build.skipped} skipped` : ""}
                    </span>
                  </div>
                </div>

                {build.itemSets.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted">Version:</span>
                    <div className="flex flex-wrap gap-1 rounded-[var(--radius)] border border-border bg-surface p-1">
                      {build.itemSets.map((set) => (
                        <button
                          key={set.id}
                          type="button"
                          onClick={() => setActiveSetIds((prev) => ({ ...prev, [game]: set.id }))}
                          aria-pressed={set.id === view.id}
                          className={`rounded-[6px] px-3 py-1 text-sm transition-colors duration-[var(--duration-fast)] ${
                            set.id === view.id
                              ? "bg-accent/15 text-accent"
                              : "text-muted hover:text-text"
                          }`}
                        >
                          {set.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {total === 0 ? (
                <p className="text-muted">No items found in this version.</p>
              ) : (
                <div className="flex flex-col gap-8">
                  <CategorySection label="Gear" items={view.gear} startNumber={offsets.gear} defaultOpen={false} />
                  <CategorySection label="Jewels" items={view.jewels} startNumber={offsets.jewels} defaultOpen={false} />
                  <GemSection groups={view.gems} startNumber={offsets.gems} defaultOpen={false} />
                  <CategorySection label="Flasks" items={view.flasks} startNumber={offsets.flasks} defaultOpen={false} />
                  <CategorySection label="Charms" items={view.charms} startNumber={offsets.charms} defaultOpen={false} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No {GAMES[game].label} build imported yet. Paste a link above to start a session for
              this game.
            </p>
          )}
        </main>
      </BuildProvider>
    </div>
  );
}
