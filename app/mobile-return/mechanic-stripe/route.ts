import { validAppReturnUrl } from "@/lib/mechanics/mobile-return";

// GET /mobile-return/mechanic-stripe?to=<app url>
//
// Where Stripe sends a mechanic who onboarded from the APP — as both the
// return_url and the refresh_url of the account link minted by
// POST /api/mobile/v1/mechanic/stripe/onboarding. Stripe only accepts https, so
// it lands here and we bounce to the app's own scheme; the in-app browser
// (`WebBrowser.openAuthSessionAsync`) closes itself when it sees that redirect.
//
// Deliberately NOT under /mechanic/*: proxy.ts gates that area on a cookie
// session, and the in-app browser has none — the mechanic would be sent to the
// web login instead of back to the app.
//
// No auth and no state: this page does nothing but redirect, and `to` is
// re-validated against the app's schemes so it cannot be pointed anywhere else.
// The app re-reads the Stripe status itself once it is back in the foreground.

export function GET(request: Request): Response {
  const target = validAppReturnUrl(new URL(request.url).searchParams.get("to"));
  if (!target) {
    return new Response("This link isn't valid. Go back to the Book My Tech app and try again.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // A bare Response: NextResponse.redirect is for http(s) targets.
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}
