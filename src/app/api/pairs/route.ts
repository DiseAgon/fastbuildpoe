import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { getPairBoard, type PairBoard } from "@/lib/market/officialCx";
import { getEconomyLeagues } from "@/lib/market/ninja";

export const runtime = "nodejs";

interface ApiResponse {
  success: boolean;
  data: (PairBoard & { leagues: string[] }) | null;
  error: string | null;
}

export async function GET(request: Request): Promise<NextResponse<ApiResponse>> {
  if (!rateLimit(`pairs:${clientKey(request)}`, 30)) {
    return NextResponse.json(
      { success: false, data: null, error: "Too many requests — try again shortly." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const leagues = await getEconomyLeagues();
  const tempLeague = leagues.find((l) => !/standard|hardcore|ruthless|ssf/i.test(l));
  const league = url.searchParams.get("league") || tempLeague || leagues[0] || "Standard";

  const board = await getPairBoard(league);
  if (!board) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error:
          "Could not load the official exchange digest (GGG publishes completed hours only). Try again in a minute.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, data: { ...board, leagues }, error: null });
}
