"use client";

import { useState } from "react";
import type { ItemSetView } from "@/types/item";
import { useBuild } from "./BuildContext";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import { buildPriceNotes } from "@/lib/pob/priceNotes";

interface ExportResult {
  code: string;
  pobbinUrl: string | null;
}

export function ExportPobButton({
  view,
  input,
  title,
}: {
  view: ItemSetView;
  input: string;
  title: string;
}) {
  const { getPrice, keyFor, sumItems } = useBuild();
  const [result, setResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  useEscapeClose(result !== null, () => setResult(null));

  if (!input) return null;

  async function handleExport() {
    setLoading(true);
    setError(null);
    setCopied(null);
    try {
      const notes = buildPriceNotes(view, getPrice, keyFor, sumItems);
      const res = await fetch("/api/build/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, notes, title }),
      });
      const json = await res.json();
      if (json.success && json.data?.code) setResult(json.data as ExportResult);
      else setError(json.error ?? "Export failed.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, which: "link" | "code") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        {loading ? "Exporting…" : "Export to PoB ↗"}
      </button>

      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setResult(null)}>
          <div
            className="flex w-full max-w-lg flex-col gap-3 rounded-[var(--radius)] border border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-accent">Export with prices</h3>
              <button type="button" onClick={() => setResult(null)} className="text-muted hover:text-text">
                ✕
              </button>
            </div>
            <p className="text-sm text-muted">
              Prices are written into the build&apos;s Notes, replacing any table from an
              earlier export. Your own notes are kept.
            </p>

            {result.pobbinUrl && (
              <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-accent/40 bg-accent/10 p-3">
                <a
                  href={result.pobbinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[var(--radius)] border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20"
                >
                  Open on pobb.in ↗
                </a>
                <button
                  type="button"
                  onClick={() => copy(result.pobbinUrl!, "link")}
                  className="text-sm text-muted hover:text-text"
                >
                  {copied === "link" ? "Copied ✓" : "Copy link"}
                </button>
                <span className="w-full truncate text-xs text-muted">{result.pobbinUrl}</span>
              </div>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-text">Or use the raw PoB import code</summary>
              <textarea
                readOnly
                value={result.code}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 h-24 w-full resize-none rounded-[6px] border border-border bg-bg px-2 py-1 font-mono text-xs text-text"
              />
              <button
                type="button"
                onClick={() => copy(result.code, "code")}
                className="mt-1 rounded-[var(--radius)] border border-border px-3 py-1 text-sm text-muted hover:text-text"
              >
                {copied === "code" ? "Copied ✓" : "Copy code"}
              </button>
            </details>
          </div>
        </div>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
