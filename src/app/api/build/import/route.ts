import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePobInput } from "@/lib/pob/fetchPob";
import { decodePobCode } from "@/lib/pob/decode";
import { parseBuildXml } from "@/lib/pob/parseBuild";
import type { ParsedBuild } from "@/types/item";

// zlib + outbound fetch require the Node.js runtime (not Edge).
export const runtime = "nodejs";

const RequestBody = z.object({
  input: z.string().min(1, "Provide a pobb.in link or PoB code.").max(200_000),
});

interface ApiResponse {
  success: boolean;
  data: ParsedBuild | null;
  error: string | null;
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const result = RequestBody.safeParse(parsedBody);
  if (!result.success) {
    return NextResponse.json(
      { success: false, data: null, error: result.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  try {
    const code = await resolvePobInput(result.data.input);
    const xml = decodePobCode(code);
    const build = parseBuildXml(xml);
    return NextResponse.json({ success: true, data: build, error: null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import build.";
    // Detailed context stays server-side; the client gets a clean message.
    console.error("[build/import] failed:", error);
    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 400 },
    );
  }
}
