import type { GameId } from "@/lib/game/registry";
import type { SharePayload } from "@/lib/share";

/**
 * Saved price-check sessions, persisted in the browser (localStorage). Lets a
 * user keep several priced builds and switch between them. No backend.
 */
export interface SavedSession {
  /** Stable id (game + input + item set) so re-saving the same build updates it. */
  id: string;
  savedAt: number;
  label: string;
  game: GameId;
  /** Grand total (div) at save time, for the list display. */
  total: number;
  payload: SharePayload;
}

const KEY = "fbp-sessions-v1";
const MAX = 50;

export function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedSession[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    /* quota or unavailable — ignore */
  }
}

/**
 * What makes two saves "the same build": the game, the build it re-imports
 * from, and the item set being priced. Derived from the payload rather than
 * compared as `id` strings so entries written under an older id scheme (which
 * did not include the item set) are still recognised and replaced instead of
 * leaving a stale duplicate behind.
 */
function identityOf(session: SavedSession): string {
  // Optional access: localStorage is user-writable, so a malformed entry must
  // not take the whole saved list down on the next save.
  return `${session.game}|${session.payload?.input}|${session.payload?.setId}`;
}

export function addSession(session: SavedSession): SavedSession[] {
  const identity = identityOf(session);
  const previous = loadSessions().filter(
    (s) => s.id !== session.id && identityOf(s) !== identity,
  );
  const next = [session, ...previous].slice(0, MAX);
  persist(next);
  return next;
}

export function removeSession(id: string): SavedSession[] {
  const next = loadSessions().filter((s) => s.id !== id);
  persist(next);
  return next;
}

export function clearSessions(): SavedSession[] {
  persist([]);
  return [];
}
