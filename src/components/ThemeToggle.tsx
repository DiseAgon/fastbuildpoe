"use client";

import { useEffect, useState } from "react";
import { applyTheme, readStoredTheme, systemTheme, type Theme } from "@/lib/theme";

/**
 * Light / dark switch.
 *
 * Renders the *current* state rather than an icon for what clicking would do —
 * a sun that means "you are in light mode" and a sun that means "switch to
 * light" are the same glyph, and guessing wrong is the classic bug here. The
 * label spells it out for screen readers either way.
 *
 * Until mounted it renders a fixed placeholder: the real theme is only known on
 * the client (localStorage + `prefers-color-scheme`), and rendering a guess on
 * the server would hydrate with the wrong icon.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readStoredTheme() ?? systemTheme());
  }, []);

  // Follow the OS while the user has not made an explicit choice.
  useEffect(() => {
    if (readStoredTheme()) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredTheme()) return;
      const next = systemTheme();
      applyTheme(next);
      setTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem("fbp-theme", next);
    setTheme(next);
  };

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={theme === null}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Dark theme — click for light" : "Light theme — click for dark"}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors duration-[var(--duration-fast)] hover:border-accent/50 hover:text-accent disabled:opacity-50"
    >
      {theme === null ? (
        <span className="h-4 w-4 rounded-full border border-current opacity-40" aria-hidden />
      ) : isDark ? (
        <MoonIcon />
      ) : (
        <SunIcon />
      )}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1Z" />
    </svg>
  );
}
