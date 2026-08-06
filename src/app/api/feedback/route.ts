import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const CATEGORIES = ["bug", "item", "idea", "other"] as const;

const Body = z.object({
  message: z.string().min(3, "Please write a bit more.").max(4000),
  /** One-tap tag from the dialog's chips, so a report needs no prose. */
  category: z.enum(CATEGORIES).optional(),
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

  const { message, category, contact, page } = parsed.data;
  // Always log (admin can read these in Vercel → Logs even with no webhook configured).
  console.log(
    "[feedback]",
    JSON.stringify({
      message,
      category: category || null,
      contact: contact || null,
      page: page || null,
    }),
  );

  // Forward to a webhook (Discord webhook, Formspree, etc.) if configured.
  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    try {
      const tag = category ? ` [${category}]` : "";
      const text = `📝 FastBuildPOE feedback${tag}\n${message}\n— contact: ${contact || "(none)"} · page: ${page || "-"}`;
      const payload = hook.includes("discord")
        ? { content: text.slice(0, 1900) }
        : { message, category: category || "", contact: contact || "", page: page || "" };
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
