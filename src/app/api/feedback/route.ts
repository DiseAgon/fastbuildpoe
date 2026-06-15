import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({
  message: z.string().min(3, "Please write a bit more.").max(4000),
  contact: z.string().max(200).optional(),
  page: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { message, contact, page } = parsed.data;
  // Always log (admin can read these in Vercel → Logs even with no webhook configured).
  console.log("[feedback]", JSON.stringify({ message, contact: contact || null, page: page || null }));

  // Forward to a webhook (Discord webhook, Formspree, etc.) if configured.
  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    try {
      const text = `📝 FastBuildPOE feedback\n${message}\n— contact: ${contact || "(none)"} · page: ${page || "-"}`;
      const payload = hook.includes("discord")
        ? { content: text.slice(0, 1900) }
        : { message, contact: contact || "", page: page || "" };
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Logged above regardless.
    }
  }

  return NextResponse.json({ success: true, error: null });
}
