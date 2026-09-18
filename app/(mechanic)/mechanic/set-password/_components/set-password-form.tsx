"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// The mechanic lands here from the "set your password" link in their approval
// email (a recovery link redeemed in /auth/callback, which leaves them with a
// session). They choose a password; from then on they sign in with email +
// password — on /mechanic/login, or in the BMT Mechanic app.
//
// The link only works on the website (/auth/callback sets cookies, and safeNext
// refuses any other scheme), which is fine: they set the password here and sign
// in to the app with it. So once it's saved the page SAYS so, rather than
// redirecting at once — an applicant who came from the app would otherwise be
// dropped into the web dashboard with no idea the app is where they work
// (Task 71).
const MIN_LENGTH = 8;

export function SetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // If they arrived without a valid session (link expired or opened directly),
  // there's nothing to update — tell them to use the link again.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setNoSession(true);
    });
  }, [supabase]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    startTransition(async () => {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      // Session is now a full password session. Say where to sign in next
      // before offering the website's dashboard.
      setSaved(true);
    });
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          className="rounded-button border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          <p className="font-semibold">Your password is set.</p>
          <p className="mt-1">
            Now sign in on the BMT Mechanic app with this email and password.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          onClick={() => {
            router.replace("/mechanic");
            router.refresh();
          }}
        >
          Or continue on the website
        </Button>
      </div>
    );
  }

  if (noSession) {
    return (
      <div className="rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This password link has expired or already been used. Please use the most
        recent link in your approval email, or contact us for a new one.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">New password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          disabled={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Confirm password</span>
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          disabled={pending}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={pending}
        className="mt-2"
      >
        {pending ? "Saving…" : "Save password & continue"}
      </Button>
    </form>
  );
}
