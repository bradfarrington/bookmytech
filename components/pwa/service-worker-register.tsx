"use client";

import { useEffect } from "react";

// Registers the service worker once on the client. Production-only on purpose:
// in `next dev` a service worker fights HMR and caches stale chunks. To test
// the PWA locally, run a production build (`next build && next start`) or
// `next dev --experimental-https`.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("Service worker registration failed", err));
  }, []);

  return null;
}
