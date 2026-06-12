import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePobInput } from "@/lib/pob/fetchPob";
import { decodePobCode } from "@/lib/pob/decode";
import { encodePobCode, injectNotes } from "@/lib/pob/encode";
import { uploadToPobbin } from "@/lib/pob/pobbin";

export const runtime = "nodejs";

const Body = z.object({
  input: z.string().min(1).max(200_000),
  notes: z.string().max(20_000),
  title: z.string().max(120).optional(),
});

export async function POST(request: Request) {
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
    const original = await resolvePobInput(parsed.data.input);
    const xml = decodePobCode(original);
    const code = encodePobCode(injectNotes(xml, parsed.data.notes));
    const pobbinUrl = await uploadToPobbin(code, parsed.data.title ?? "FastBuildPOE price check");
    return NextResponse.json({ success: true, data: { code, pobbinUrl }, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export build.";
    console.error("[build/export] failed:", error);
    return NextResponse.json({ success: false, data: null, error: message }, { status: 400 });
  }
}
