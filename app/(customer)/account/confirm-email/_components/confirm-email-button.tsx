"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, MailWarning } from "lucide-react";
import { confirmEmailChangeAction, type ConfirmEmailState } from "@/app/actions/customer-account";

// The button that actually spends the token (Task 58). A POST, not the GET of
// opening the link, so a mail scanner fetching the URL can't burn it.
//
// The token comes in as a prop and goes back as a hidden field. That is not a
// hole: it is a single-use secret the person holding this page already has, and
// it names nothing else. The action re-checks that it is live and unspent.

const initial: ConfirmEmailState = null;

export function ConfirmEmailButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(confirmEmailChangeAction, initial);

  if (state?.ok) {
    return (
      <>
        <p className="flex items-start gap-2.5 rounded-button border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Done. You now sign in as{" "}
            <span className="break-all font-bold">{state.newEmail}</span>.
          </span>
        </p>
        {/* Signing in again is the honest instruction: this was opened from an
            email client that may hold no session, and a session elsewhere still
            carries the old address until its token refreshes. */}
        <Link
          href="/login"
          className="flex h-11 items-center justify-center rounded-button bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-90"
        >
          Sign in with your new email
        </Link>
      </>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok && (
        <p className="flex items-start gap-2.5 rounded-button border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex h-11 items-center justify-center rounded-button bg-brand-blue px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Confirming…" : "Confirm my new email"}
      </button>
    </form>
  );
}
