// The cookie-consent choice, shared by the banner (client, writes it), the
// footer "Cookie settings" link (client, re-opens the banner) and the funnel
// tracker (server action, reads it before minting the analytics cookie).
//
// It is deliberately NOT httpOnly: the banner has to read it to know whether
// to show, and write it without a server round-trip. There's nothing sensitive
// in it — it's one of two words.

export const CONSENT_COOKIE = "bmt_consent";
/** 12 months, matching what /cookies tells the customer. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

export type ConsentChoice = "accepted" | "rejected";

export function parseConsent(raw: string | undefined | null): ConsentChoice | null {
  return raw === "accepted" || raw === "rejected" ? raw : null;
}

/** Name of the DOM event the footer link fires to re-open the banner. */
export const OPEN_COOKIE_SETTINGS_EVENT = "bmt:open-cookie-settings";
