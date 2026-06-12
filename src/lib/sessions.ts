import type { GameId } from "@/lib/game/registry";
import type { SharePayload } from "@/lib/share";

/**
 * Saved price-check sessions, persisted in the browser (localStorage). Lets a
 * user keep several priced builds and switch between them. No backend.
 */
export interface SavedSession {
  /** Stable id (game + input) so re-saving the same build updates it. */
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

export function addSession(session: SavedSession): SavedSession[] {
  const next = [session, ...loadSessions().filter((s) => s.id !== session.id)].slice(0, MAX);
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
