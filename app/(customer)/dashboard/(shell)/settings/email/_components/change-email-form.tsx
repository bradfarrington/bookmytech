"use client";

import { useActionState } from "react";
import { AtSign, MailPlus } from "lucide-react";
import { Button, Caption, Notice } from "@/components/dashboard/ui";
import { requestEmailChange, type EmailChangeState } from "@/app/actions/customer-account";
import { Field, FormAlert, PasswordInput, TextInput } from "../../_components/field";

// Change the account email (Task 58). Ours end to end: our screen, our server
// action, our Resend template, our confirmation link, our success screen. No
// supabase.co URL appears anywhere in it.
//
// This replaced a client-side `auth.updateUser({ email })`, which handed the job
// to GoTrue's own mailer and its hosted verify endpoint. The logic now lives in
// lib/account/email-change.ts, shared with the app's
// POST /api/mobile/v1/account/email.
//
// THE PASSWORD FIELD IS BACK, and this time it means something. Under the old
// flow the request went from the browser straight to Supabase carrying the
// session, so a password check in front of it protected nothing — anyone could
// have skipped it. It is now checked server-side before a single email is sent,
// which is a guard GoTrue's flow never had.
//
// Nothing about the account changes until the link in the new inbox is opened.

const initial: EmailChangeState = null;

export function ChangeEmailForm({
  currentEmail,
  pendingEmail,
}: {
  currentEmail: string;
  /** A change already waiting for its link to be opened, if any. */
  pendingEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState(requestEmailChange, initial);

  // The freshly-requested address wins over the one the page loaded with.
  const waitingFor = state?.ok ? state.sentTo : pendingEmail;
  const error = state && !state.ok ? state : null;

  return (
    <>
      {waitingFor && (
        <Notice icon={MailPlus} title="Confirmation waiting">
          A change to <span className="break-all font-bold text-text-primary">{waitingFor}</span> is
          waiting. Open the link we emailed to that address to finish it. We&apos;ve also let{" "}
          <span className="break-all">{currentEmail}</span> know.
        </Notice>
      )}

      <form action={formAction} className="flex flex-col gap-3.5">
        <Field
          label="New email"
          htmlFor="new-email"
          help="Bookings that aren't finished yet move to the new address. Finished jobs keep the one they were invoiced to."
        >
          <TextInput
            id="new-email"
            name="new_email"
            type="email"
            icon={AtSign}
            autoComplete="email"
            placeholder="you@example.com"
            required
            invalid={error?.field === "new_email"}
            disabled={pending}
          />
        </Field>

        <Field
          label="Your password"
          htmlFor="current-password"
          help="Confirms it's you before we email anything."
        >
          <PasswordInput
            id="current-password"
            name="current_password"
            autoComplete="current-password"
            aria-describedby="current-password-help"
            required
            invalid={error?.field === "password"}
            disabled={pending}
          />
        </Field>

        {error && <FormAlert>{error.error}</FormAlert>}

        <Button type="submit" size="lg" full disabled={pending}>
          {pending ? "Sending…" : "Send confirmation link"}
        </Button>
        <Caption className="text-center">
          You keep signing in as <span className="break-all">{currentEmail}</span> until the change
          is confirmed.
        </Caption>
      </form>
    </>
  );
}
