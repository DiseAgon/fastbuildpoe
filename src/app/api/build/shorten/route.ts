import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { uploadToPobbin } from "@/lib/pob/pobbin";

// Outbound fetch to pobb.in requires the Node.js runtime (not Edge).
export const runtime = "nodejs";

const Body = z.object({
  input: z.string().min(1).max(200_000),
  title: z.string().max(120).optional(),
});

const POBBIN_URL = /pobb\.in\/([A-Za-z0-9_-]+)/i;

/**
 * Turn an import input into a short, linkable reference for a share URL.
 *
 * Inputs that already are pobb.in links pass through untouched — only a pasted
 * PoB code is uploaded, and only because embedding it in the URL hash is what
 * made share links tens of kilobytes long. Returns `{ url: null }` rather than
 * an error when the upload fails, so the client can fall back to the long form.
 */
export async function POST(request: Request) {
  if (!rateLimit(`shorten:${clientKey(request)}`, 10)) {
    return NextResponse.json(
      { success: false, data: null, error: "Too many share links — wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: "Body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const trimmed = parsed.data.input.trim();
  const existing = trimmed.match(POBBIN_URL);
  if (existing) {
    return NextResponse.json({
      success: true,
      data: { url: `https://pobb.in/${existing[1]}` },
      error: null,
    });
  }

  const url = await uploadToPobbin(trimmed, parsed.data.title ?? "FastBuildPOE shared build");
  return NextResponse.json({ success: true, data: { url }, error: null });
}
