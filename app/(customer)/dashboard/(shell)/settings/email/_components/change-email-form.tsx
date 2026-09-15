"use client";

import { useState } from "react";
import { AtSign, MailPlus } from "lucide-react";
import { Button, Caption, Notice } from "@/components/dashboard/ui";
import { createClient } from "@/lib/supabase/client";
import { Field, FormAlert, TextInput } from "../../_components/field";

// Change the account email: the same client-side `auth.updateUser({ email })`
// the mobile app uses (Task 39), on purpose. Supabase confirms the change by
// link: to the new address and, with Secure Email Change on, to the current
// one as well, so nothing moves until both inboxes agree. Doing it through the
// service-role client would skip that check, and the email is the one field
// that controls password resets. No server code here.
//
// The emailRedirectTo URL is registered in Supabase: keep it exactly as is.
//
// Once the change is confirmed, a trigger on auth.users (0065) carries the new
// address onto bookings that aren't finished yet and reminders not yet sent.

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageFor(error: { message: string; status?: number; code?: string }): string {
  if (error.code === "email_exists" || /already|registered|exists/i.test(error.message)) {
    return "That email address is already in use.";
  }
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return "We've sent a few emails already. Please wait a minute and try again.";
  }
  if (error.code === "email_address_invalid") return "Enter a valid email address.";
  return "We couldn't send the confirmation just now. Please try again.";
}

export function ChangeEmailForm({
  currentEmail,
  pendingEmail,
}: {
  currentEmail: string;
  /** A change Supabase is already waiting on, if any. */
  pendingEmail: string | null;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(pendingEmail);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const next = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(next)) {
      setError("Enter a valid email address.");
      return;
    }
    if (next === currentEmail.toLowerCase()) {
      setError("That's already your email address.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: `${window.location.origin}/dashboard/settings?email=changed` },
      );
      if (updateError) {
        setError(messageFor(updateError));
        return;
      }
      setSentTo(next);
      setEmail("");
    } catch {
      setError("We couldn't send the confirmation just now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {sentTo && (
        <Notice icon={MailPlus} title="Confirmation waiting">
          A change to <span className="break-all font-bold text-text-primary">{sentTo}</span> is waiting.
          We&apos;ve emailed a link to that address and another to{" "}
          <span className="break-all">{currentEmail}</span>. Open both to finish the change.
        </Notice>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-3.5">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-describedby="new-email-help"
            invalid={!!error}
            disabled={pending}
          />
        </Field>

        {error && <FormAlert>{error}</FormAlert>}

        <Button type="submit" size="lg" full disabled={pending || !email.trim()}>
          {pending ? "Sending…" : "Send confirmation links"}
        </Button>
        <Caption className="text-center">
          You keep signing in as <span className="break-all">{currentEmail}</span> until the change is confirmed.
        </Caption>
      </form>
    </>
  );
}
