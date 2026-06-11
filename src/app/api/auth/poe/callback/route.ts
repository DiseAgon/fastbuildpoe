import { NextRequest, NextResponse } from "next/server";
import { oauthConfig, exchangeCode } from "@/lib/auth/poeOauth";
import { signSession, verifySession, SESSION_COOKIE, HANDSHAKE_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!oauthConfig().enabled) {
    return NextResponse.redirect(`${origin}/?auth=disabled`);
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const handshake = verifySession<{ state: string }>(
    request.cookies.get(HANDSHAKE_COOKIE)?.value,
  );

  if (!code || !state || !handshake || handshake.state !== state) {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }

  try {
    const token = await exchangeCode(code);
    const res = NextResponse.redirect(`${origin}/?auth=ok`);
    res.cookies.set(SESSION_COOKIE, signSession({ token }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
    res.cookies.delete(HANDSHAKE_COOKIE);
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/?auth=error`);
  }
}
