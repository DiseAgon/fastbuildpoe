import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { getEconomyLeagues } from "@/lib/market/ninja";

/**
 * Shared prefix for the market GET routes: per-IP cap, challenge-league default,
 * and the `{ success, data: board+leagues, error }` envelope.
 */
export async function serveBoard<T extends object>(
  request: Request,
  opts: {
    key: string;
    maxPerMinute: number;
    error: string;
    load: (league: string, url: URL) => Promise<T | null | NextResponse>;
  },
): Promise<NextResponse> {
  if (!rateLimit(`${opts.key}:${clientKey(request)}`, opts.maxPerMinute)) {
    return NextResponse.json(
      { success: false, data: null, error: "Too many requests — try again shortly." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const leagues = await getEconomyLeagues();
  const tempLeague = leagues.find((l) => !/standard|hardcore|ruthless|ssf/i.test(l));
  const league = url.searchParams.get("league") || tempLeague || leagues[0] || "Standard";

  const board = await opts.load(league, url);
  if (board instanceof NextResponse) return board;
  if (!board) {
    return NextResponse.json({ success: false, data: null, error: opts.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, data: { ...board, leagues }, error: null });
}
