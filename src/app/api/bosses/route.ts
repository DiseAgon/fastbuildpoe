import { serveBoard } from "@/lib/market/serveBoard";
import { getBossBoard } from "@/lib/market/bosses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return serveBoard(request, {
    key: "bosses",
    maxPerMinute: 30,
    error: "Could not load boss-economy data from poe.ninja. Try again in a minute.",
    load: (league) => getBossBoard(league),
  });
}
