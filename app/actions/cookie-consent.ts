"use server";

import { cookies } from "next/headers";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  parseConsent,
  type ConsentChoice,
} from "@/lib/cookie-consent";

const SESSION_COOKIE = "bmt_sid";

/**
 * Record the visitor's cookie-banner choice.
 *
 * Done server-side (rather than the banner writing document.cookie) for one
 * reason: the analytics session cookie is httpOnly, so only the server can
 * delete it when consent is withdrawn. PECR treats a rejected banner as
 * "stop", not just "don't start", so a leftover bmt_sid from before the
 * choice must go too.
 */
export async function setCookieConsent(choice: ConsentChoice): Promise<void> {
  if (parseConsent(choice) === null) return;
  const jar = await cookies();
  jar.set(CONSENT_COOKIE, choice, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSENT_MAX_AGE,
  });
  if (choice === "rejected") jar.delete(SESSION_COOKIE);
}
