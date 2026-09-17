import { siteUrl } from "@/lib/utils";

// Where the mechanic app may be sent back to after a Stripe-hosted page.
//
// Stripe only accepts https `return_url` / `refresh_url`, and the app needs to
// land on its own scheme. So the mobile onboarding route hands Stripe a page of
// ours (app/mobile-return/mechanic-stripe) carrying the app URL as a query
// param, and that page 302s to it.
//
// A page that redirects to a URL from its query string is an open redirect
// unless the target is pinned down. It is pinned to the app's own schemes, and
// checked TWICE: when the link is minted, and again on the way out — the bounce
// URL is a plain GET anyone can hand-write, so the first check alone protects
// nothing.

/** `bmtmechanic:` is the store build; `exp+bmt-mechanic-app:` an Expo dev build. */
const APP_SCHEMES = new Set(["bmtmechanic:", "exp+bmt-mechanic-app:"]);

const MAX_RETURN_URL_LENGTH = 500;

/** The URL, normalised, if it points into the mechanic app. Otherwise null. */
export function validAppReturnUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > MAX_RETURN_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return APP_SCHEMES.has(url.protocol) ? url.toString() : null;
}

export const MOBILE_STRIPE_RETURN_PATH = "/mobile-return/mechanic-stripe";

/** The https page Stripe is given, which bounces to `appUrl`. */
export function mobileStripeReturnUrl(appUrl: string): string {
  return `${siteUrl()}${MOBILE_STRIPE_RETURN_PATH}?to=${encodeURIComponent(appUrl)}`;
}
