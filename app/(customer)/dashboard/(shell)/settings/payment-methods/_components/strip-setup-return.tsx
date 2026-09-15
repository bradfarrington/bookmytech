"use client";

import { useEffect } from "react";

// Back from a 3-D Secure detour, Stripe's parameters are on the URL. The page
// has already rendered the fresh list and the outcome from them; this takes
// them off the address bar so a reload or a shared link doesn't repeat it.
// history.replaceState integrates with the Next router without a re-render.

const STRIPE_PARAMS = ["setup_intent", "setup_intent_client_secret", "redirect_status"];

export function StripSetupReturn() {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of STRIPE_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return null;
}
