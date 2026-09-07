"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONSENT_COOKIE, parseConsent } from "@/lib/cookie-consent";

// Self-hosted funnel tracking. Each call records one row in `funnel_events`
// (Task 10 Stage 1) so /admin/analytics can build the booking conversion
// funnel. Anonymous visitors are stitched together by a first-party session
// cookie; once they're a signed-in customer we also stamp `user_id`.
//
// Writes go through the service-role client (there's no public INSERT policy on
// funnel_events) — same privileged-write pattern as booking_events. Tracking is
// best-effort: any failure is swallowed so it can never break the booking flow.
//
// The session cookie is a non-essential analytics cookie under PECR, so it is
// only minted once the visitor has chosen "Accept all" on the cookie banner
// (components/cookie-consent.tsx). Without that, each event still lands but
// with a throwaway id, so visits are not linked together.

const SESSION_COOKIE = "bmt_sid";
// 180 days — long enough to attribute a returning visitor's whole journey.
const SESSION_MAX_AGE = 60 * 60 * 24 * 180;

/** Read the session id cookie, minting + persisting one on first sight. */
async function resolveSessionId(): Promise<string> {
  const jar = await cookies();
  const consented = parseConsent(jar.get(CONSENT_COOKIE)?.value) === "accepted";
  // A leftover bmt_sid (set before the banner shipped, or before the visitor
  // rejected) is ignored without consent — same as if it were never set.
  const existing = consented ? jar.get(SESSION_COOKIE)?.value : undefined;
  if (existing) return existing;

  const sid = crypto.randomUUID();
  if (!consented) return sid;
  try {
    jar.set(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  } catch {
    // Set from a context where cookies are read-only — the id still works for
    // this single event; the next request that can write will persist one.
  }
  return sid;
}

export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    const sessionId = await resolveSessionId();

    // Best-effort link to a signed-in customer (most funnel hits are anonymous).
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const admin = createAdminClient();
    await admin.from("funnel_events").insert({
      session_id: sessionId,
      user_id: userId,
      event_name: eventName,
      properties: properties ?? null,
    });
  } catch (err) {
    // Never let analytics break a user flow.
    console.error("trackEvent failed", eventName, err);
  }
}
