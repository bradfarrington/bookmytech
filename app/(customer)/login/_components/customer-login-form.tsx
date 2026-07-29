"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signInUnified } from "@/app/actions/sign-in";
import type { SignInState } from "@/app/actions/sign-in";
import { requestPasswordReset } from "@/app/actions/booking-account";

const initialState: SignInState = null;

export function CustomerLoginForm({ justCreated }: { justCreated?: boolean }) {
  const [state, formAction, pending] = useActionState(signInUnified, initialState);
  const [email, setEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetPending, startResetTransition] = useTransition();

  function handleForgotPassword() {
    setResetError(null);
    startResetTransition(async () => {
      const result = await requestPasswordReset(email);
      if (!result.ok) {
        setResetError(result.error);
        return;
      }
      setResetSent(true);
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {justCreated && (
        <p className="rounded-button border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Your account is ready — sign in to view your dashboard.
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          disabled={pending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
        />
      </label>

      {state?.error && (
        <p
          role="alert"
          className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      {resetSent && (
        <p className="rounded-button border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-brand-blue">
          Check your inbox — we&apos;ve emailed you a link to set a new password.
        </p>
      )}

      {resetError && (
        <p role="alert" className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {resetError}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending} className="mt-2">
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      {!resetSent && (
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetPending || !email.trim()}
          className="text-center text-sm font-semibold text-brand-blue hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {resetPending ? "Sending…" : "Forgotten your password?"}
        </button>
      )}

      <p className="text-center text-sm text-text-secondary">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand-blue hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
