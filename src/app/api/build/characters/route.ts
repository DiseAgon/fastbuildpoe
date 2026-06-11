import { NextRequest, NextResponse } from "next/server";
import { fetchCharacterList } from "@/lib/auth/poeOauth";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = verifySession<{ token: string }>(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session?.token) {
    return NextResponse.json({ success: false, data: null, error: "Not signed in." }, { status: 401 });
  }
  try {
    const characters = await fetchCharacterList(session.token);
    return NextResponse.json({ success: true, data: characters, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list characters.";
    return NextResponse.json({ success: false, data: null, error: message }, { status: 502 });
  }
}
