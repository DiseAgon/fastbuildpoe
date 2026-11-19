import { NextResponse } from "next/server";
import { USER_AGENT, fetchWithTimeout } from "@/lib/trade/http";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_BYTES = 512_000;

/** Only the public item-art paths. Anything else on the CDN stays unproxied. */
function allowedIconUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "web.poecdn.com") return null;
  if (url.username || url.password) return null;
  if (!url.pathname.startsWith("/gen/image/") && !url.pathname.startsWith("/image/")) return null;
  return url;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!rateLimit(`icon:${clientKey(request)}`, 180)) {
    return new NextResponse("Too many requests.", { status: 429 });
  }
  const raw = new URL(request.url).searchParams.get("u");
  const target = raw ? allowedIconUrl(raw) : null;
  if (!target) return new NextResponse("Bad icon URL.", { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(
      target.toString(),
      {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: "image/png,image/webp,image/*" },
      },
      8000,
    );
  } catch {
    return new NextResponse("Icon fetch failed.", { status: 502 });
  }
  if (upstream.status !== 200) return new NextResponse("Icon unavailable.", { status: 502 });

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!type.startsWith("image/")) return new NextResponse("Not an image.", { status: 502 });

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return new NextResponse("Icon rejected.", { status: 502 });
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
