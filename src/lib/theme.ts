export type Theme = "light" | "dark";

/** localStorage key holding the user's explicit choice (absent = follow the OS). */
export const THEME_STORAGE_KEY = "fbp-theme";

/**
 * Resolve and apply the theme before first paint.
 *
 * Injected into the document head as a blocking inline script, so the tokens in
 * globals.css are already correct when the first frame is painted — a dark-mode
 * user must never see a flash of the cream palette. Kept as a source string
 * because it has to run outside React, before hydration, with no imports.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var d=s==="dark"||(!s&&matchMedia("(prefers-color-scheme: dark)").matches);
if(d)document.documentElement.dataset.theme="dark";
}catch(e){}})()`;

export function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The user's explicit choice, or null when they have not made one. */
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}
