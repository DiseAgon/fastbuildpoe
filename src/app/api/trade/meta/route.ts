import { NextResponse } from "next/server";
import { isGameId } from "@/lib/game/registry";
import { getTradeMeta } from "@/lib/trade/meta";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get("game") ?? "";
  if (!isGameId(game)) {
    return NextResponse.json(
      { success: false, data: null, error: "Unknown or missing game." },
      { status: 400 },
    );
  }

  try {
    const meta = await getTradeMeta(game);
    return NextResponse.json({ success: true, data: meta, error: null });
  } catch (error) {
    console.error("[trade/meta] failed:", error);
    return NextResponse.json(
      { success: false, data: null, error: "Failed to load trade metadata." },
      { status: 500 },
    );
  }
}
