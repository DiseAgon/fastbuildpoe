import { serveBoard } from "@/lib/market/serveBoard";
import { getPairBoard } from "@/lib/market/officialCx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return serveBoard(request, {
    key: "pairs",
    maxPerMinute: 30,
    error:
      "Could not load the official exchange digest (GGG publishes completed hours only). Try again in a minute.",
    load: (league) => getPairBoard(league),
  });
}
