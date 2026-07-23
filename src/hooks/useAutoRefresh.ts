import { useEffect, useRef } from "react";

const FOCUS_STALE_MS = 60_000;

/**
 * Keeps market data live: re-runs `refresh` on an interval and when the tab
 * becomes visible again (throttled so tab-switching doesn't spam the API).
 * `refresh` should be a stable callback (useCallback) doing a silent reload.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = 180_000): void {
  const lastRunRef = useRef(Date.now());

  useEffect(() => {
    const run = () => {
      lastRunRef.current = Date.now();
      refresh();
    };
    const id = setInterval(run, intervalMs);
    const onVisible = () => {
      const isVisible = document.visibilityState === "visible";
      if (isVisible && Date.now() - lastRunRef.current > FOCUS_STALE_MS) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh, intervalMs]);
}
