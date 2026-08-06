"use client";

import { useState } from "react";
import { useEscapeClose } from "@/hooks/useEscapeClose";

const EMAIL = "agondise@gmail.com";

/**
 * Feedback categories, offered as one-tap chips.
 *
 * Most people who hit a problem will not write a paragraph about it, and the
 * single empty box asked them to. A chip is a complete report on its own — the
 * page it was sent from is attached automatically — so the cheapest useful
 * message costs two clicks.
 */
const CATEGORIES = [
  { id: "bug", label: "Something's broken" },
  { id: "item", label: "An item is wrong" },
  { id: "idea", label: "Idea / request" },
  { id: "other", label: "Something else" },
] as const;

type Category = (typeof CATEGORIES)[number]["id"];

/**
 * "link" is the inline footer wording; "floating" is the button that follows the
 * page.
 *
 * The footer link was the only way in, which meant scrolling past an entire
 * priced build to reach it — and the market pages had no way in at all. The
 * floating variant is mounted once in the root layout, so every page has it.
 */
export type FeedbackVariant = "link" | "floating";

export function FeedbackButton({ variant = "link" }: { variant?: FeedbackVariant }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  useEscapeClose(open, () => setOpen(false));

  // A chip alone is a valid report; free text alone is too.
  const canSend = category !== null || message.trim().length >= 3;

  function openDialog() {
    setOpen(true);
    setState("idle");
  }

  async function submit() {
    if (!canSend || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The server requires a few characters, so a chip-only report sends
          // its label as the message rather than an empty string.
          message: message.trim() || CATEGORIES.find((c) => c.id === category)?.label || "",
          category: category ?? undefined,
          contact,
          page: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setState("done");
        setMessage("");
        setContact("");
        setCategory(null);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent("FastBuildPOE feedback")}&body=${encodeURIComponent(message)}`;

  return (
    <>
      {variant === "floating" ? (
        <button
          type="button"
          onClick={openDialog}
          aria-haspopup="dialog"
          title="Report a bug, a wrong item, or an idea"
          className="group fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-accent/40 bg-surface/95 py-2 pl-3 pr-3 text-sm text-muted shadow-card backdrop-blur transition-colors duration-[var(--duration-fast)] hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent sm:pr-4"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
            <path
              d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-4.2A8 8 0 1 1 21 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="hidden font-medium sm:inline">Feedback</span>
          <span className="sr-only sm:hidden">Send feedback</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          aria-haspopup="dialog"
          className="text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          Send feedback
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
            className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-5 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-accent">Send feedback</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            {state === "done" ? (
              <>
                <p className="text-sm text-text">Thanks! Your feedback was sent. 🙏</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="self-start rounded-[var(--radius)] border border-border px-3 py-1 text-sm text-muted hover:border-accent/50 hover:text-accent"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="What is this about?">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategory(category === c.id ? null : c.id)}
                      aria-pressed={category === c.id}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
                        category === c.id
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border text-muted hover:border-accent/50 hover:text-accent"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
                  }}
                  placeholder={
                    category
                      ? "Anything else worth knowing? (optional)"
                      : "Bug, idea, or anything else…"
                  }
                  className="h-28 w-full resize-none rounded-[6px] border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Contact (optional — email/Discord)"
                  className="w-full rounded-[6px] border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={state === "sending" || !canSend}
                    className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
                  >
                    {state === "sending" ? "Sending…" : "Send"}
                  </button>
                  <a href={mailto} className="text-xs text-muted hover:text-text">
                    or email {EMAIL}
                  </a>
                </div>
                <p className="text-xs text-muted">
                  Pick a tag and hit Send — that&apos;s enough. The page you&apos;re on is
                  attached automatically.
                </p>
                {state === "error" && (
                  <p className="text-xs text-danger">
                    Couldn&apos;t send — please use the email link above.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
