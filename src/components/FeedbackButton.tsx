"use client";

import { useState } from "react";
import { useEscapeClose } from "@/hooks/useEscapeClose";

const EMAIL = "agondise@gmail.com";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  useEscapeClose(open, () => setOpen(false));

  async function submit() {
    if (message.trim().length < 3) return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          contact,
          page: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setState("done");
        setMessage("");
        setContact("");
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
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setState("idle");
        }}
        className="text-muted underline-offset-2 hover:text-accent hover:underline"
      >
        Send feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-5 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-accent">Send feedback</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-text">
                ✕
              </button>
            </div>

            {state === "done" ? (
              <p className="text-sm text-text">Thanks! Your feedback was sent. 🙏</p>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Bug, idea, or anything else…"
                  className="h-28 w-full resize-none rounded-[6px] border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Contact (optional — email/Discord)"
                  className="w-full rounded-[6px] border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-accent"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={state === "sending" || message.trim().length < 3}
                    className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
                  >
                    {state === "sending" ? "Sending…" : "Send"}
                  </button>
                  <a href={mailto} className="text-xs text-muted hover:text-text">
                    or email {EMAIL}
                  </a>
                </div>
                {state === "error" && (
                  <p className="text-xs text-red-400">
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
