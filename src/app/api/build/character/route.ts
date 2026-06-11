import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isGameId } from "@/lib/game/registry";
import { fetchCharacterData } from "@/lib/auth/poeOauth";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { parseCharacter } from "@/lib/poe/parseCharacterItems";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1),
  game: z.string().refine(isGameId, "Unknown game."),
});

export async function POST(request: NextRequest) {
  const session = verifySession<{ token: string }>(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.token) {
    return NextResponse.json({ success: false, data: null, error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, data: null, error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const character = await fetchCharacterData(session.token, parsed.data.name);
    const build = parseCharacter(
      character as Parameters<typeof parseCharacter>[0],
      parsed.data.game as Parameters<typeof parseCharacter>[1],
    );
    return NextResponse.json({ success: true, data: build, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import character.";
    console.error("[build/character] failed:", error);
    return NextResponse.json({ success: false, data: null, error: message }, { status: 502 });
  }
}
