"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { signIn, type SignInState } from "@/app/actions/sign-in";

const initialState: SignInState = null;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="you@bookmytech.co.uk"
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={pending}
        className="mt-2"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
