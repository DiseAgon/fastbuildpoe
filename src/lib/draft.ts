import type { GameId } from "@/lib/game/registry";

/**
 * Autosaved working state, so an accidental refresh (or a closed tab) doesn't
 * throw away prices someone spent time looking up.
 *
 * Distinct from `sessions.ts`, which is the explicit "Save" list of several
 * named builds. This is a single always-on draft of whatever you're doing right
 * now: one slot, overwritten continuously, restored on load.
 *
 * Only the import input is stored, never the parsed build — the build is
 * re-imported from it, so a stale draft can't pin an out-of-date parse.
 */
export interface Draft {
  v: 1;
  savedAt: number;
  game: GameId;
  /** Import input per game (pobb.in link or PoB code). */
  inputs: Partial<Record<GameId, string>>;
  /** Selected item-set id per game. */
  setIds: Partial<Record<GameId, string>>;
  /** League per game. */
  leagues: Partial<Record<GameId, string>>;
  /** Manual price overrides, keyed as BuildContext does. */
  prices: Record<string, string>;
}

const KEY = "fbp-draft-v1";
/** Drop drafts older than this so a long-abandoned one doesn't resurrect. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (parsed.v !== 1 || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    if (parsed.game !== "poe1" && parsed.game !== "poe2") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<Draft, "v" | "savedAt">): void {
  try {
    const payload: Draft = { ...draft, v: 1, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota or unavailable — autosave is best-effort by design */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** True when there is anything worth restoring. */
export function draftHasWork(draft: Draft): boolean {
  const hasInput = Object.values(draft.inputs).some((v) => !!v);
  const hasPrices = Object.values(draft.prices).some((v) => v !== "");
  return hasInput || hasPrices;
}
