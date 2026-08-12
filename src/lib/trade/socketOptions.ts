export interface SocketOptions {
  /** PoE1 largest linked group. */
  links: number | null;
  /** PoE1 total socket count. */
  sockets: number | null;
  /** PoE2 augmentable/rune sockets. */
  runeSockets: number | null;
}

export function itemSocketCounts(sockets?: string): { sockets: number; links: number } {
  if (!sockets) return { sockets: 0, links: 0 };
  const groups = sockets.trim().split(/\s+/).filter(Boolean);
  const counts = groups.map((group) => (group.match(/[RGBWA]/gi) ?? []).length);
  return {
    sockets: counts.reduce((sum, count) => sum + count, 0),
    links: Math.max(0, ...counts),
  };
}

export function emptySocketOptions(): SocketOptions {
  return { links: null, sockets: null, runeSockets: null };
}
