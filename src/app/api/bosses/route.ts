import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { getBossBoard, type BossBoard } from "@/lib/market/bosses";
import { getEconomyLeagues } from "@/lib/market/ninja";

export const runtime = "nodejs";

interface ApiResponse {
  success: boolean;
  data: (BossBoard & { leagues: string[] }) | null;
  error: string | null;
}

export async function GET(request: Request): Promise<NextResponse<ApiResponse>> {
  if (!rateLimit(`bosses:${clientKey(request)}`, 30)) {
    return NextResponse.json(
      { success: false, data: null, error: "Too many requests — try again shortly." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const leagues = await getEconomyLeagues();
  // Default to the temp (challenge) league when one is live — picked up
  // automatically within hours of a 3.xx launch.
  const tempLeague = leagues.find((l) => !/standard|hardcore|ruthless|ssf/i.test(l));
  const league = url.searchParams.get("league") || tempLeague || leagues[0] || "Standard";

  const board = await getBossBoard(league);
  if (!board) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: "Could not load boss-economy data from poe.ninja. Try again in a minute.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: { ...board, leagues }, error: null });
}
