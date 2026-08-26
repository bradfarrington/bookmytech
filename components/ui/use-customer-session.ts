"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Whether the visitor is signed in, for nav purposes only.
 *
 * Resolved in the BROWSER rather than on the server, deliberately. The pages
 * that render CustomerNav — the landing page, /help, /mechanics and the legal
 * pages — are static, and reading auth cookies on the server would make all four
 * dynamic: a serverless invocation for every marketing pageview and no CDN
 * caching on the most crawled pages on the site. That's a real cost to pay for a
 * nav link.
 *
 * `getSession()` reads the session the client already holds locally — no network
 * round-trip, unlike `getUser()`, which revalidates against Supabase. That is
 * the right trade here precisely BECAUSE this is only a nav link: it decides
 * whether to say "Sign in" or "My account", nothing more. Every route it can
 * lead to is gated independently in proxy.ts, so a stale or forged local session
 * gets someone a link they'll be bounced off, not access to anything.
 *
 * `undefined` means "not resolved yet" and is distinct from `false`. Callers
 * reserve the space and render nothing rather than flashing "Sign in" at a
 * signed-in customer for a frame.
 */
export function useCustomerSession(): boolean | undefined {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });

    // Keeps the nav honest when a session starts or ends in another tab.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
