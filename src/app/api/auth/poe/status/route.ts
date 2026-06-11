import { NextRequest, NextResponse } from "next/server";
import { oauthConfig } from "@/lib/auth/poeOauth";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = verifySession<{ token: string }>(request.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({
    enabled: oauthConfig().enabled,
    signedIn: Boolean(session?.token),
  });
}
