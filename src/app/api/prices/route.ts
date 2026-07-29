import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { priceBuildItems, type BuildPriceResult, type PriceableItem } from "@/lib/market/buildPrices";

export const runtime = "nodejs";

/** A build can carry a lot of gems; cap the batch so one request stays bounded. */
const MAX_ITEMS = 400;

interface ApiResponse {
  success: boolean;
  data: BuildPriceResult | null;
  error: string | null;
}

const bad = (error: string, status: number): NextResponse<ApiResponse> =>
  NextResponse.json({ success: false, data: null, error }, { status });

/** Keep only the fields the pricer reads, and only when they are the right type. */
function toPriceable(raw: unknown): PriceableItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || typeof r.name !== "string") return null;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  return {
    key: r.key,
    name: r.name,
    baseType: typeof r.baseType === "string" ? r.baseType : "",
    rarity: typeof r.rarity === "string" ? r.rarity : "",
    category: typeof r.category === "string" ? r.category : "",
    gemLevel: num(r.gemLevel),
    quality: num(r.quality),
    corrupted: r.corrupted === true,
  };
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  if (!rateLimit(`prices:${clientKey(request)}`, 30)) {
    return bad("Too many requests — try again shortly.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("Body must be JSON.", 400);
  }
  if (typeof body !== "object" || body === null) return bad("Body must be a JSON object.", 400);

  const { game, league, items } = body as Record<string, unknown>;
  if (typeof game !== "string" || typeof league !== "string" || !league) {
    return bad("`game` and `league` are required.", 400);
  }
  if (!Array.isArray(items)) return bad("`items` must be an array.", 400);
  if (items.length > MAX_ITEMS) return bad(`Too many items (max ${MAX_ITEMS}).`, 400);

  const priceable = items.map(toPriceable).filter((i): i is PriceableItem => i !== null);

  try {
    const result = await priceBuildItems(game, league, priceable);
    return NextResponse.json({ success: true, data: result, error: null });
  } catch {
    return bad("Could not load prices from poe.ninja. Try again in a minute.", 502);
  }
}
