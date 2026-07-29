"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Mirror of the mechanic set-password form for the customer side. They arrive
// with a session from the recovery link, choose a password, and land on their
// dashboard — from then on it's email + password on /login.
const MIN_LENGTH = 8;

export function CustomerSetPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [pending, startTransition] = useTransition();

  // If they arrived without a valid session (link expired or opened directly),
  // there's nothing to update — tell them to request a fresh link.
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
      router.replace("/dashboard");
      router.refresh();
    });
  }

  if (noSession) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This password link has expired or has already been used. Request a new
          one and we&apos;ll email it straight over.
        </div>
        <Link href="/login">
          <Button variant="secondary" size="lg" fullWidth>
            Back to sign in
          </Button>
        </Link>
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

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Save password & continue"}
      </Button>
    </form>
  );
}
