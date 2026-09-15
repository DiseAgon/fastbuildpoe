import { serveBoard } from "@/lib/market/serveBoard";
import { getBreakoutBoard } from "@/lib/market/ninja";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return serveBoard(request, {
    key: "breakout",
    maxPerMinute: 30,
    error: "Could not load unique-item data from poe.ninja. Try again in a minute.",
    load: (league) => getBreakoutBoard(league),
  });
}
