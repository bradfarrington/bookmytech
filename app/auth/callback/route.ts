import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Auth callback for both server-generated magic links and OAuth.
//
// Two redemption paths, because they hand us different inputs:
//
//  1. `?token_hash=...&type=magiclink` — server-generated invite links
//     (see app/actions/mechanics.ts). We email a link straight to this route
//     and redeem it with verifyOtp, which writes the auth cookies via
//     @supabase/ssr. We deliberately do NOT email Supabase's raw action_link:
//     that hits /auth/v1/verify and returns tokens in the URL *fragment*
//     (implicit flow), which a server route handler can never see.
//
//  2. `?code=...` — OAuth / PKCE flows, exchanged via exchangeCodeForSession.
//
// Both then redirect to the `next` query param.
//
// Whitelist accepted destinations so an attacker can't craft a callback URL
// that hands them a session and bounces to an external domain.
const ALLOWED_NEXT = new Set(["/", "/mechanic", "/admin"]);
const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "magiclink",
  "invite",
  "recovery",
  "email",
]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const nextParam = searchParams.get("next") ?? "/";
  const next = ALLOWED_NEXT.has(nextParam) ? nextParam : "/";

  const supabase = await createClient();

  // Path 1 — server-generated email link (token_hash + type).
  if (tokenHash && typeParam && ALLOWED_OTP_TYPES.has(typeParam as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeParam as EmailOtpType,
    });
    if (error) {
      return NextResponse.redirect(`${origin}/?auth_error=verify_failed`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Path 2 — OAuth / PKCE code exchange.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
}
