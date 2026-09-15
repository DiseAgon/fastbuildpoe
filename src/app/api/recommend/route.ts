import { serveBoard } from "@/lib/market/serveBoard";
import { getFlipPicks } from "@/lib/market/recommend";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return serveBoard(request, {
    key: "recommend",
    maxPerMinute: 20,
    error: "Could not load exchange data. Try again in a minute.",
    load: (league) => getFlipPicks(league),
  });
}
