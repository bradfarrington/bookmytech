"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics/track";

// Fires a single funnel event when this component mounts. Drop it into a
// server-rendered page (e.g. /book/match) to record a "viewed" funnel step
// reliably — unlike an onClick before navigation, the page has already loaded
// so the tracking request isn't cancelled mid-flight.
//
// Guards against React's dev double-invoke / re-renders with a ref so the event
// fires at most once per mount.
export function TrackOnMount({
  event,
  properties,
}: {
  event: string;
  properties?: Record<string, unknown>;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, properties);
  }, [event, properties]);

  return null;
}
