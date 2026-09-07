"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  OPEN_COOKIE_SETTINGS_EVENT,
  parseConsent,
  type ConsentChoice,
} from "@/lib/cookie-consent";
import { setCookieConsent } from "@/app/actions/cookie-consent";

// Cookie banner (Task 29). Two choices, matching /cookies §7: "Accept all"
// allows the optional analytics cookie (bmt_sid — see app/actions/track-event.ts,
// which reads the consent cookie before minting it); "Reject non-essential"
// leaves only the essential cookies. The choice is stored in a first-party
// cookie for 12 months and can be changed via the footer's "Cookie settings"
// link, which fires OPEN_COOKIE_SETTINGS_EVENT.
//
// The cookie is read on the client after mount rather than in the root layout:
// calling cookies() in a layout would opt EVERY route into dynamic rendering.
// The cost is that the banner appears a frame after hydration, which is fine —
// it slides in from the bottom anyway.

function readChoice(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
}

// The server action is the real writer (it can also delete the httpOnly
// analytics cookie on "rejected"). The client write is a fallback so the
// banner still stays dismissed if the action fails, e.g. offline.
function writeChoice(choice: ConsentChoice) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${choice}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  setCookieConsent(choice).catch(() => {});
}

// The stored choice as an external store, so the component reads the cookie
// without a set-state-in-effect and renders nothing on the server (the cookie
// is only readable client-side; "ssr" is the server snapshot).
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const notify = () => listeners.forEach((cb) => cb());
const getSnapshot = () => readChoice();
const getServerSnapshot = () => "ssr" as const;

export function CookieConsent() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Set by the footer's "Cookie settings" link to show the banner again even
  // though a choice is already stored.
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  if (stored === "ssr") return null;
  if (stored !== null && !reopened) return null;

  const choose = (choice: ConsentChoice) => {
    writeChoice(choice);
    setReopened(false);
    notify();
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-surface-card p-5 shadow-[0_12px_40px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center sm:gap-6">
        <div className="flex-1">
          <p id="cookie-consent-title" className="text-sm font-bold text-text-primary">
            Cookies on Book My Tech
          </p>
          <p id="cookie-consent-desc" className="mt-1 text-[13px] leading-[1.55] text-text-secondary">
            We use essential cookies to make the site and bookings work. With your permission we
            also use one analytics cookie to see where the booking process could be better. No
            marketing cookies. See our{" "}
            <Link href="/cookies" className="font-semibold text-brand-blue hover:underline">
              Cookie Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="h-10 rounded-button border border-border bg-surface-card px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="h-10 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-light"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that re-opens the banner so a visitor can change their choice. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
