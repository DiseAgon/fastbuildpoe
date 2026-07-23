import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { getEconomyLeagues, getFlipBoard, isCxType, type FlipBoard } from "@/lib/market/ninja";
import { getItemPairIndex, normalizeName } from "@/lib/market/officialCx";

export const runtime = "nodejs";

interface ApiResponse {
  success: boolean;
  data: (FlipBoard & { leagues: string[] }) | null;
  error: string | null;
}

export async function GET(request: Request): Promise<NextResponse<ApiResponse>> {
  if (!rateLimit(`market:${clientKey(request)}`, 60)) {
    return NextResponse.json(
      { success: false, data: null, error: "Too many requests — try again shortly." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "Currency";
  if (!isCxType(type)) {
    return NextResponse.json(
      { success: false, data: null, error: `Unknown market type "${type}".` },
      { status: 400 },
    );
  }

  const leagues = await getEconomyLeagues();
  // Default to the temp (challenge) league when one is live — at a 3.xx launch
  // poe.ninja adds it within hours and this picks it up automatically.
  const tempLeague = leagues.find((l) => !/standard|hardcore|ruthless|ssf/i.test(l));
  const league = url.searchParams.get("league") || tempLeague || leagues[0] || "Standard";

  const [board, official] = await Promise.all([
    getFlipBoard(league, type),
    // Official GGG stats are an enrichment — a failure must not break the board.
    getItemPairIndex(league).catch(() => null),
  ]);
  if (!board) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: "Could not load exchange data from poe.ninja. Try again in a minute.",
      },
      { status: 502 },
    );
  }

  const enriched: FlipBoard = official
    ? {
        ...board,
        officialHour: { start: official.hourStart, end: official.hourEnd },
        rows: board.rows.map((row) => {
          const info = official.byName.get(normalizeName(row.name));
          return info ? { ...row, official: info } : row;
        }),
      }
    : board;

  return NextResponse.json({ success: true, data: { ...enriched, leagues }, error: null });
}
