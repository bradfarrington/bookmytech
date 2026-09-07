"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signUp, type SignUpState } from "@/app/actions/signup";

const initialState: SignUpState = null;

const INPUT =
  "h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50";

export function CustomerSignupForm({
  defaultName,
  defaultEmail,
  referralCode,
}: {
  defaultName?: string;
  defaultEmail?: string;
  /** Pre-filled from a share link (?ref=). */
  referralCode?: string;
}) {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  // The code field is tucked behind a link unless they arrived with one — most
  // people signing up don't have a code, and an empty box invites "what's this?".
  // A rejected code (server error) also reveals it so they can correct it.
  const [showCode, setShowCode] = useState(Boolean(referralCode));
  const codeVisible = showCode || Boolean(state?.field === "referral_code");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Full name</span>
        <input
          type="text"
          name="full_name"
          autoComplete="name"
          required
          defaultValue={defaultName}
          disabled={pending}
          placeholder="Alex Smith"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          disabled={pending}
          placeholder="you@email.com"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          placeholder="At least 8 characters"
          className={INPUT}
        />
      </label>

      {codeVisible ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-text-primary">
            Referral code{" "}
            <span className="font-normal text-text-muted">(optional)</span>
          </span>
          <input
            type="text"
            name="referral_code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            defaultValue={referralCode}
            disabled={pending}
            placeholder="BMT4F9K2Q"
            aria-invalid={state?.field === "referral_code" || undefined}
            className={`${INPUT} font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
          />
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Gift size={13} className="shrink-0 text-brand-blue" />
            Get £10 off your first booking with a friend&apos;s code.
          </span>
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowCode(true)}
          className="self-start text-sm font-semibold text-brand-blue hover:underline"
        >
          Have a referral code?
        </button>
      )}

      {state?.error && (
        <p
          role="alert"
          className="rounded-button border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending} className="mt-2">
        {pending ? "Creating your account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-blue hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
