"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signUp, type SignUpState } from "@/app/actions/signup";

const initialState: SignUpState = null;

export function CustomerSignupForm({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(signUp, initialState);

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
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
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
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
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
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
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
