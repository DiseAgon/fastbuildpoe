import { NextResponse } from "next/server";
import { serveBoard } from "@/lib/market/serveBoard";
import { getFlipBoard, isCxType } from "@/lib/market/ninja";
import { getItemPairIndex, normalizeName } from "@/lib/market/officialCx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return serveBoard(request, {
    key: "market",
    maxPerMinute: 60,
    error: "Could not load exchange data from poe.ninja. Try again in a minute.",
    load: async (league, url) => {
      const type = url.searchParams.get("type") ?? "Currency";
      if (!isCxType(type)) {
        return NextResponse.json(
          { success: false, data: null, error: `Unknown market type "${type}".` },
          { status: 400 },
        );
      }
      const [board, official] = await Promise.all([
        getFlipBoard(league, type),
        getItemPairIndex(league).catch(() => null),
      ]);
      if (!board) return null;
      if (!official) return board;
      return {
        ...board,
        officialHour: { start: official.hourStart, end: official.hourEnd },
        rows: board.rows.map((row) => {
          const info = official.byName.get(normalizeName(row.name));
          return info ? { ...row, official: info } : row;
        }),
      };
    },
  });
}
