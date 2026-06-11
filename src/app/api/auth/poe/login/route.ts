import { NextRequest, NextResponse } from "next/server";
import { oauthConfig, makeState, authorizeUrl } from "@/lib/auth/poeOauth";
import { signSession, HANDSHAKE_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!oauthConfig().enabled) {
    return NextResponse.redirect(`${origin}/?auth=disabled`);
  }
  const state = makeState();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(HANDSHAKE_COOKIE, signSession({ state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
