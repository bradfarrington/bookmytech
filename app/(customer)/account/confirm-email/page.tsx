import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MailWarning } from "lucide-react";
import { peekEmailChange } from "@/lib/account/email-change";
import { AuthShell } from "../../_components/auth-shell";
import { ConfirmEmailButton } from "./_components/confirm-email-button";

export const metadata: Metadata = {
  title: "Confirm your email | Book My Tech",
  // Nothing about a tokenised URL should reach an index.
  robots: { index: false, follow: false },
};

// Where our own email-change link lands (Task 58). Replaces the old route,
// which went through Supabase's verify endpoint and bounced to
// /dashboard/settings?email=changed.
//
// OUTSIDE the dashboard on purpose. The link is opened from an email client,
// often on another device or in a private window, so there may well be no
// session — and the dashboard's proxy gate would send a signed-out visitor to
// /login and lose the token. The token IS the proof here, so no session is
// needed or asked for.
//
// Opening the link does NOT spend the token; the button does. Corporate mail
// scanners and "safe links" services fetch URLs inside messages, and a
// single-use token fetched by a scanner is one the customer never gets to use —
// they would see "that link has expired" with no way to tell why.
export const dynamic = "force-dynamic";

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const raw = typeof token === "string" ? token : "";
  const peeked = await peekEmailChange(raw);

  if (!peeked.ok) {
    return (
      <AuthShell title="That link didn't work" subtitle="Nothing on your account has changed.">
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2.5 rounded-button border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{peeked.error}</span>
          </p>
          <Link
            href="/dashboard/settings/email"
            className="flex h-11 items-center justify-center rounded-button bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            Ask for a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Confirm your new email"
      subtitle="One more tap and your account moves across."
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2.5 rounded-button border border-border bg-surface px-3.5 py-3 text-sm text-text-secondary">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
          <span>
            You&apos;ll sign in as{" "}
            <span className="break-all font-bold text-text-primary">{peeked.newEmail}</span> from
            now on. Bookings that aren&apos;t finished yet move with you.
          </span>
        </p>
        <ConfirmEmailButton token={raw} />
      </div>
    </AuthShell>
  );
}
