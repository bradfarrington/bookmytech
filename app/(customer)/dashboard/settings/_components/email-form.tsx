"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Change the account email — the same client-side `auth.updateUser({ email })`
// the mobile app uses (Task 39), on purpose. Supabase confirms the change by
// link: to the new address and, with Secure Email Change on, to the current
// one as well, so nothing moves until both inboxes agree. Doing it through the
// service-role client would skip that check, and the email is the one field
// that controls password resets. No server code here.
//
// Once the change is confirmed, a trigger on auth.users (0065) carries the new
// address onto bookings that aren't finished yet and reminders not yet sent.
export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (next === currentEmail.toLowerCase()) {
      toast.error("That's already your email address.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: `${window.location.origin}/dashboard/settings?email=changed` },
      );
      if (error) {
        toast.error(
          /already|registered|exists/i.test(error.message)
            ? "That email address is already in use."
            : error.message,
        );
        return;
      }
      setSentTo(next);
      setEmail("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Current email</span>
        <input
          type="email"
          value={currentEmail}
          disabled
          readOnly
          className="h-11 cursor-not-allowed rounded-button border border-border bg-surface px-3.5 text-sm text-text-muted"
        />
      </label>

      {sentTo ? (
        <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-brand-blue">
          Check your inbox. We&apos;ve sent a confirmation link to <strong>{sentTo}</strong> and one to
          your current address — click both and your email will be updated.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-primary">New email</span>
            <input
              type="email"
              name="new_email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              disabled={pending}
              className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
            />
            <span className="text-xs text-text-muted">
              We&apos;ll email a confirmation link to both your current and new addresses. Jobs
              already completed keep the address they were invoiced to.
            </span>
          </label>

          <Button
            type="submit"
            variant="secondary"
            size="lg"
            disabled={pending || !email.trim()}
            className="self-start"
          >
            {pending ? "Sending…" : "Change email"}
          </Button>
        </>
      )}
    </form>
  );
}
