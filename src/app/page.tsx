"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ImportForm } from "@/components/import/ImportForm";
import { SignInPoe } from "@/components/import/SignInPoe";
import { HowToUse } from "@/components/HowToUse";
import { CategorySection } from "@/components/build/CategorySection";
import { GemSection } from "@/components/build/GemSection";
import { PaperDoll } from "@/components/build/PaperDoll";
import { BuildProvider, formatDivine, useBuild } from "@/components/build/BuildContext";
import { DivineIcon } from "@/components/build/DivineIcon";
import { ShareButton } from "@/components/build/ShareButton";
import { ExportPobButton } from "@/components/build/ExportPobButton";
import { GAME_IDS, GAMES, type GameId } from "@/lib/game/registry";
import type { ItemSetView, ParsedBuild, ParsedItem } from "@/types/item";
import type { TradeMeta } from "@/lib/trade/meta";
import { decodeEmbeddedPrices, decodeShare, type SharePayload } from "@/lib/share";
import { clearGameDraft, draftHasWork, loadDraft, saveDraft } from "@/lib/draft";
import { itemKey } from "@/lib/build/itemKey";
import { clearGameTradeSelections } from "@/lib/trade/selectionSession";
import { sumPrices } from "@/lib/build/price";
import { useBuildPrices } from "@/hooks/useBuildPrices";
import { SavedPanel } from "@/components/SavedPanel";
import { FeedbackButton } from "@/components/FeedbackButton";
import {
  addSession,
  clearSessions,
  loadSessions,
  removeSession,
  type SavedSession,
} from "@/lib/sessions";

interface ImportResponse {
  success: boolean;
  data: ParsedBuild | null;
  /** Encoded prices found in the build's Notes, for pastes made by "Share". */
  share?: string | null;
  error: string | null;
}

/** What an import produced: the build, plus any prices the paste carried. */
interface ImportResult {
  build: ParsedBuild;
  share: string | null;
}

/** Paste id from a `#p=<id>` share link. */
const SHARED_PASTE_HASH = /^#p=([A-Za-z0-9_-]+)$/;

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

/**
 * Swap in one game's prices, dropping whatever that game held before.
 *
 * Loading a saved build has to *replace* its prices, not merge them: merging
 * left the previous build's numbers sitting on any item the new one doesn't
 * carry, so the total — and the next save — included prices for items that were
 * no longer on screen. The other game's prices are untouched.
 */
function withGamePrices(
  prev: Record<string, string>,
  game: GameId,
  next: Record<string, string>,
): Record<string, string> {
  const kept = Object.fromEntries(
    Object.entries(prev).filter(([key]) => !key.startsWith(`${game}|`)),
  );
  return { ...kept, ...next };
}

/** Grand total for the current view: live prices, with manual overrides winning. */
function GrandTotal({ items }: { items: ParsedItem[] }) {
  const { sumItems, countUnpriced, pricesLoading, pricesUnavailable } = useBuild();
  const total = sumItems(items);
  const unpriced = countUnpriced(items);

  if (pricesUnavailable) {
    return (
      <span className="text-xs text-muted" title={pricesUnavailable}>
        live prices unavailable
      </span>
    );
  }
  if (total <= 0) {
    return pricesLoading ? <span className="text-xs text-muted">pricing…</span> : null;
  }
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-[var(--radius)] border border-accent/40 bg-accent/10 px-3 py-1 text-accent">
        Total {formatDivine(total)} <DivineIcon />
      </span>
      {unpriced > 0 && (
        <span className="text-xs text-muted" title="Items with no live price — mostly rares">
          +{unpriced} unpriced
        </span>
      )}
    </span>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameId>("poe1");
  const [builds, setBuilds] = useState<ByGame<ParsedBuild | null>>(emptyByGame(null));
  const [activeSetIds, setActiveSetIds] = useState<ByGame<string>>(emptyByGame(""));
  const [meta, setMeta] = useState<ByGame<TradeMeta | null>>(emptyByGame(null));
  const [leagues, setLeagues] = useState<ByGame<string>>(emptyByGame(""));
  const [customLeague, setCustomLeague] = useState(false);
  const [inputs, setInputs] = useState<ByGame<string>>(emptyByGame(""));
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gearView, setGearView] = useState<"doll" | "list">("doll");
  /** Flashes "Saved ✓" — re-saving a build leaves the list count unchanged, so
   *  without it a successful save is indistinguishable from a dead button. */
  const [justSaved, setJustSaved] = useState(false);
  /** Blocks autosave until the initial restore has run, so an empty first
   *  render can't overwrite a good draft. */
  const [restored, setRestored] = useState(false);
  /** Cancels superseded imports and prevents a late response from restoring a
   *  session after the user cleared it. */
  const importController = useRef<AbortController | null>(null);
  const importSequence = useRef(0);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

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

  const viewItems = useMemo(() => (view ? allItemsOf(view) : []), [view]);
  const { quotes, loading: pricesLoading, unavailable: pricesUnavailable } = useBuildPrices(
    game,
    league,
    viewItems,
  );

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

  const importInput = useCallback(async (
    input: string,
    options: { refresh?: boolean; replacePrices?: boolean } = {},
  ): Promise<ImportResult | null> => {
    importController.current?.abort();
    const controller = new AbortController();
    importController.current = controller;
    const sequence = ++importSequence.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/build/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, refresh: options.refresh ?? false }),
        signal: controller.signal,
      });
      const json: ImportResponse = await res.json();
      if (sequence !== importSequence.current) return null;
      if (!json.success || !json.data) {
        setError(json.error ?? "Import failed.");
        return null;
      }
      const imported = json.data;
      if (options.replacePrices) {
        setPrices((prev) => withGamePrices(prev, imported.game, {}));
      }
      setBuilds((prev) => ({ ...prev, [imported.game]: imported }));
      setActiveSetIds((prev) => ({ ...prev, [imported.game]: imported.activeItemSetId }));
      setInputs((prev) => ({ ...prev, [imported.game]: input }));
      setGame(imported.game);
      return { build: imported, share: json.share ?? null };
    } catch {
      if (controller.signal.aborted || sequence !== importSequence.current) return null;
      setError("Could not reach the server.");
      return null;
    } finally {
      if (sequence === importSequence.current) {
        importController.current = null;
        setLoading(false);
      }
    }
  }, []);

  /**
   * Apply the prices a shared paste carried in its Notes. Callers opt in: a
   * `#s=` link and the autosaved draft carry their own prices and must not be
   * overruled by whatever happens to be written in the paste.
   */
  const applyEmbedded = useCallback(async (encoded: string | null) => {
    if (!encoded) return;
    try {
      const embedded = await decodeEmbeddedPrices(encoded);
      setLeagues((prev) => ({ ...prev, [embedded.game]: embedded.league }));
      setActiveSetIds((prev) => ({ ...prev, [embedded.game]: embedded.setId }));
      setPrices((prev) => withGamePrices(prev, embedded.game, embedded.prices));
      setCustomLeague(false);
    } catch {
      /* not one of our pastes, or written by a newer version — keep the build */
    }
  }, []);

  function handleImport(input: string) {
    // Pasting a shared link should bring its prices along, the same as opening
    // that link directly — the paste is the share.
    void importInput(input, { refresh: true, replacePrices: true }).then(
      (r) => void applyEmbedded(r?.share ?? null),
    );
  }

  function clearCurrentSession() {
    const label = GAMES[game].label;
    if (
      (builds[game] || inputs[game] || Object.keys(prices).some((key) => key.startsWith(`${game}|`))) &&
      !window.confirm(`Clear the current ${label} session? Saved builds will be kept.`)
    ) {
      return;
    }

    importController.current?.abort();
    importController.current = null;
    importSequence.current += 1;
    clearGameDraft(game);
    clearGameTradeSelections(game);
    setBuilds((prev) => ({ ...prev, [game]: null }));
    setActiveSetIds((prev) => ({ ...prev, [game]: "" }));
    setInputs((prev) => ({ ...prev, [game]: "" }));
    setLeagues((prev) => ({ ...prev, [game]: meta[game]?.defaultLeague ?? "" }));
    setPrices((prev) => withGamePrices(prev, game, {}));
    setError(null);
    setLoading(false);
    setCustomLeague(false);
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }

  // Apply a parsed build that didn't come from a pasted input (e.g. character import).
  const applyBuild = useCallback((b: ParsedBuild) => {
    setBuilds((prev) => ({ ...prev, [b.game]: b }));
    setActiveSetIds((prev) => ({ ...prev, [b.game]: b.activeItemSetId }));
    setGame(b.game);
    setError(null);
  }, []);

  const restoreFromPayload = useCallback(
    (payload: SharePayload) => {
      setPrices((prev) => withGamePrices(prev, payload.game, payload.prices));
      setLeagues((prev) => ({ ...prev, [payload.game]: payload.league }));
      // Seed the input and set id up front rather than waiting on the re-import:
      // the import is a network round-trip, and until it lands the autosave (and
      // the Save button) would otherwise see a build with no input at all.
      setInputs((prev) => ({ ...prev, [payload.game]: payload.input }));
      setActiveSetIds((prev) => ({ ...prev, [payload.game]: payload.setId }));
      setGame(payload.game);
      setCustomLeague(false);
      setPanelOpen(false);
      setError(null);
      if (payload.input) {
        void importInput(payload.input).then((r) => {
          if (r) setActiveSetIds((prev) => ({ ...prev, [r.build.game]: payload.setId }));
        });
      }
    },
    [importInput],
  );

  /** Open a `#p=<id>` share link: the paste is both the build and the prices. */
  const restoreFromPaste = useCallback(
    async (pasteId: string) => {
      const result = await importInput(`https://pobb.in/${pasteId}`);
      await applyEmbedded(result?.share ?? null);
    },
    [importInput, applyEmbedded],
  );

  // Restore once on mount. A share link in the hash is an explicit request and
  // wins over the autosaved draft; otherwise pick the draft back up so a
  // refresh mid-pricing doesn't lose anything.
  //
  // `restored` is only flipped once the restore has fully landed — including
  // the async re-import — because it is what unblocks the autosave, and an
  // autosave that fires mid-restore writes a half-built state over the draft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const done = () => {
      if (!cancelled) setRestored(true);
    };

    const pasteId = window.location.hash.match(SHARED_PASTE_HASH)?.[1];
    if (pasteId) {
      void restoreFromPaste(pasteId).catch(() => {}).finally(done);
      return () => {
        cancelled = true;
      };
    }

    if (window.location.hash.startsWith("#s=")) {
      void decodeShare(window.location.hash.slice(3))
        .then((payload) => {
          if (!cancelled) restoreFromPayload(payload);
        })
        .catch(() => {
          /* ignore bad payload */
        })
        .finally(done);
      return () => {
        cancelled = true;
      };
    }

    const draft = loadDraft();
    if (!draft || !draftHasWork(draft)) {
      done();
      return;
    }
    setPrices(draft.prices);
    setLeagues((prev) => ({ ...prev, ...draft.leagues }));
    setInputs((prev) => ({ ...prev, ...draft.inputs }));
    setActiveSetIds((prev) => ({ ...prev, ...draft.setIds }));
    setGame(draft.game);
    const input = draft.inputs[draft.game];
    if (!input) {
      done();
      return;
    }
    void importInput(input)
      .then((r) => {
        const setId = draft.setIds[r?.build.game ?? draft.game];
        if (r && setId) setActiveSetIds((prev) => ({ ...prev, [r.build.game]: setId }));
      })
      .finally(done);
    return () => {
      cancelled = true;
    };
  }, [restoreFromPayload, restoreFromPaste, importInput]);

  /**
   * The item set actually on screen. `activeSetIds` can name a set this build
   * doesn't have (a share link for a version that was since renamed), in which
   * case the view falls back to the first one — and saving the id we asked for
   * rather than the one being shown is how a save came back as a different
   * version than the user had open.
   */
  const setIdsForSave = useMemo(
    () => (view ? { ...activeSetIds, [game]: view.id } : activeSetIds),
    [activeSetIds, game, view],
  );

  // Autosave the working state (debounced — prices change per keystroke).
  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => {
      saveDraft({ game, inputs, setIds: setIdsForSave, leagues, prices });
    }, 600);
    return () => clearTimeout(timer);
  }, [restored, game, inputs, setIdsForSave, leagues, prices]);

  function saveCurrent() {
    const input = inputs[game];
    if (!input || !build || !view) return;
    const gamePrices = Object.fromEntries(
      Object.entries(prices).filter(([k, v]) => k.startsWith(`${game}|`) && v !== ""),
    );
    // Record the total the page is showing — live quotes included, manual
    // overrides winning — not just the numbers that were typed by hand.
    const total = sumPrices(
      prices,
      quotes,
      allItemsOf(view).map((item) => itemKey(game, item)),
    );
    const payload: SharePayload = { v: 1, game, input, setId: view.id, league, prices: gamePrices };
    const version = build.itemSets.length > 1 ? ` · ${view.title}` : "";
    const label = `${build.className ?? "Build"}${build.ascendancy ? ` · ${build.ascendancy}` : ""}${version}`;
    // Keyed by version too, so pricing a build's "Budget" and "Endgame" sets
    // gives two saves instead of the second silently replacing the first.
    setSessions(
      addSession({ id: `${game}|${input}|${view.id}`, savedAt: Date.now(), label, game, total, payload }),
    );
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  }

  function switchGame(id: GameId) {
    setGame(id);
    setError(null);
    setCustomLeague(false);
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
      <header className="sticky top-0 z-40 -mx-4 flex flex-wrap items-center justify-between gap-4 border-b border-border/40 bg-bg/85 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cat.svg" alt="FastBuildPOE logo" width={40} height={40} className="h-10 w-10" />
          <div>
            <h1 className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text font-serif text-2xl font-bold text-transparent">
              FastBuildPOE
            </h1>
            <p className="text-sm text-muted">Trade-search links for every item in a build.</p>
          </div>
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

          <label className="sr-only" htmlFor="league-select">
            League
          </label>
          {!gameMeta ? (
            <span className="text-sm text-muted">Loading…</span>
          ) : customLeague ? (
            <span className="flex items-center gap-1">
              <input
                value={league}
                autoFocus
                placeholder="Type league"
                onChange={(e) => setLeagues((prev) => ({ ...prev, [game]: e.target.value }))}
                className="w-40 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setCustomLeague(false)}
                title="Back to league list"
                className="rounded-full border border-border px-2 py-1.5 text-xs text-muted hover:text-text"
              >
                ≡
              </button>
            </span>
          ) : (
            <select
              id="league-select"
              value={gameMeta.leagues.includes(league) ? league : "__custom__"}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setCustomLeague(true);
                } else {
                  setLeagues((prev) => ({ ...prev, [game]: e.target.value }));
                }
              }}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-accent"
            >
              {gameMeta.leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
            title="Your saved builds"
          >
            Saved ({sessions.length})
          </button>

          <a
            href="/market"
            className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            title="Currency Exchange flip finder"
          >
            Market ↗
          </a>
          <ThemeToggle />
        </div>
      </header>

      <BuildProvider
        game={game}
        league={league || null}
        divineIcon={gameMeta?.divineIcon ?? null}
        prices={prices}
        quotes={quotes}
        pricesLoading={pricesLoading}
        pricesUnavailable={pricesUnavailable}
        onPriceChange={setPrice}
      >
        <main className="flex flex-1 flex-col gap-8 pb-16">
          <HowToUse />
          <section
            aria-label="Import a build"
            className="rounded-[var(--radius)] border border-border bg-surface/60 p-5"
          >
            {/* key changes remount the form: on game switch, and once the
                restored input arrives so it shows up in the field. */}
            <ImportForm
              key={`${game}|${inputs[game] ?? ""}`}
              initialValue={inputs[game] ?? ""}
              onImport={handleImport}
              onClear={clearCurrentSession}
              canClear={Boolean(
                loading ||
                  error ||
                  builds[game] ||
                  inputs[game] ||
                  Object.keys(prices).some((key) => key.startsWith(`${game}|`)),
              )}
              loading={loading}
            />
            {error && (
              <p className="mt-3 text-sm text-danger" role="alert">
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <GrandTotal items={allItemsOf(view)} />
                    <ShareButton
                      game={game}
                      input={inputs[game]}
                      view={view}
                      league={league}
                      prices={prices}
                      title={`${build.className ?? "Build"} — FastBuildPOE prices`}
                    />
                    <ExportPobButton
                      view={view}
                      input={inputs[game]}
                      title={`${build.className ?? "Build"} — FastBuildPOE prices`}
                    />
                    {inputs[game] ? (
                      <button
                        type="button"
                        onClick={saveCurrent}
                        className={`rounded-[var(--radius)] border bg-surface px-3 py-1 text-sm transition-colors ${
                          justSaved
                            ? "border-accent/60 text-accent"
                            : "border-border text-muted hover:border-accent/50 hover:text-accent"
                        }`}
                        title="Save this build + prices to your browser"
                      >
                        {justSaved ? "Saved ✓" : "Save"}
                      </button>
                    ) : (
                      <span
                        className="text-xs text-muted"
                        title="Saving re-imports the build from its pobb.in link or PoB code. A character loaded over the PoE API has neither — paste its PoB code to save or share it."
                      >
                        Save needs a link
                      </span>
                    )}
                    <span
                      className="text-xs text-muted"
                      title="This working session is saved automatically in your browser."
                    >
                      Autosaved
                    </span>
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
                  <div className="flex items-center gap-1 self-start rounded-full border border-border bg-surface p-0.5 text-xs">
                    {(["doll", "list"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setGearView(mode)}
                        aria-pressed={gearView === mode}
                        className={`rounded-full px-3 py-1 transition-colors ${
                          gearView === mode
                            ? "bg-accent/15 font-medium text-accent"
                            : "text-muted hover:text-accent"
                        }`}
                      >
                        {mode === "doll" ? "Paper doll" : "List"}
                      </button>
                    ))}
                  </div>

                  {gearView === "doll" ? (
                    <>
                      <PaperDoll view={view} />
                      <GemSection groups={view.gems} startNumber={offsets.gems} defaultOpen={false} />
                    </>
                  ) : (
                    <>
                      <CategorySection label="Gear" items={view.gear} startNumber={offsets.gear} defaultOpen={false} />
                      <CategorySection label="Jewels" items={view.jewels} startNumber={offsets.jewels} defaultOpen={false} />
                      <GemSection groups={view.gems} startNumber={offsets.gems} defaultOpen={false} />
                      <CategorySection label="Flasks" items={view.flasks} startNumber={offsets.flasks} defaultOpen={false} />
                      <CategorySection label="Charms" items={view.charms} startNumber={offsets.charms} defaultOpen={false} />
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-border bg-surface/30 px-6 py-12 text-center">
              <svg viewBox="0 0 24 24" aria-hidden className="h-10 w-10 text-accent/50">
                <path
                  d="M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4v9M4 7l8 4 8-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="font-serif text-lg text-text">
                No {GAMES[game].label} build imported yet
              </p>
              <p className="max-w-sm text-sm text-muted">
                Paste a pobb.in link or Path of Building code above — you&apos;ll get a tunable
                trade-search link for every item in the build.
              </p>
            </div>
          )}
        </main>
      </BuildProvider>

      <footer className="mt-auto border-t border-border/60 py-6 text-center text-xs text-muted">
        <div className="flex items-center justify-center gap-3">
          <a href="https://fastbuildpoe.xyz" className="font-medium text-accent hover:underline">
            fastbuildpoe.xyz
          </a>
          <span aria-hidden>·</span>
          <FeedbackButton />
        </div>
        <p className="mt-2">
          Fan-made tool — not affiliated with Grinding Gear Games. Unique and gem prices come from
          poe.ninja; rares are priced by their rolls, so enter those yourself.
        </p>
      </footer>

      <SavedPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        sessions={sessions}
        onLoad={(s) => restoreFromPayload(s.payload)}
        onDelete={(id) => setSessions(removeSession(id))}
        onClear={() => setSessions(clearSessions())}
      />
    </div>
  );
}
