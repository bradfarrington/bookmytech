import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth / magic-link callback. Supabase Auth redirects here with `?code=...`
// after a user clicks a magic link or completes an OAuth flow. We exchange
// the code for a session (which writes the auth cookies via @supabase/ssr),
// then redirect to the `next` query param.
//
// The `next` param ships in the magic-link's redirect_to URL, e.g.
// `${SITE_URL}/auth/callback?next=/mechanic` — see app/actions/mechanics.ts.
//
// Whitelist accepted destinations so an attacker can't craft a callback URL
// that hands them a session and bounces to an external domain.
const ALLOWED_NEXT = new Set(["/", "/mechanic", "/admin"]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = ALLOWED_NEXT.has(nextParam) ? nextParam : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
