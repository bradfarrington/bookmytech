import { useEffect, useRef } from "react";

/**
 * Keep page data fresh without Supabase Realtime.
 *
 * Refetches when the tab becomes visible again (user returns from another tab /
 * app) and every `intervalMs` while the tab is visible. Polling is paused while
 * the tab is hidden so we're not hammering the DB in the background.
 *
 * Ported from the gam-learn-crm chat (which deliberately polls instead of using
 * Realtime) so Book My Tech doesn't depend on table replication being enabled.
 *
 * Default interval: 60 s. Pass 0 to disable interval polling and only refetch on
 * visibility change. The callback typically does `router.refresh()` (to re-run a
 * server component) or a client-side refetch.
 */
export function useStayFresh(onRefetch: () => void, intervalMs = 60_000) {
  const onRefetchRef = useRef(onRefetch);
  onRefetchRef.current = onRefetch;

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fire = () => onRefetchRef.current();

    const start = () => {
      if (intervalId !== null || intervalMs <= 0) return;
      intervalId = setInterval(fire, intervalMs);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fire();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
