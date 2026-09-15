"use client";

import { useActionState, useState, useTransition } from "react";
import { CircleCheck, Info, Lock } from "lucide-react";
import {
  changePassword,
  sendPasswordResetLink,
  type PasswordChangeState,
} from "@/app/actions/customer-account";
import { Button, ButtonLink, Notice } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { Field, FormAlert, PasswordInput } from "../../_components/field";
import { passwordStrength, type StrengthScore } from "../_lib/password-strength";

const initial: PasswordChangeState = null;

const BAR_COLOURS: Record<StrengthScore, string> = {
  0: "bg-border",
  1: "bg-danger",
  2: "bg-warning",
  3: "bg-success",
  4: "bg-success",
};

function StrengthBar({ score }: { score: StrengthScore }) {
  return (
    <div className="mt-2 flex gap-1" aria-hidden>
      {[1, 2, 3, 4].map((step) => (
        <div key={step} className={cn("h-1 flex-1 rounded-sm", score >= step ? BAR_COLOURS[score] : "bg-border")} />
      ))}
    </div>
  );
}

/** Forgotten the current password: email a reset link to the signed-in address. */
function ForgottenPassword({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendPasswordResetLink();
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  }

  return (
    <Notice
      icon={Info}
      title="Forgotten your current one?"
      action={
        sent ? undefined : (
          <Button variant="secondary" size="sm" onClick={send} disabled={pending}>
            {pending ? "Sending…" : "Email me a reset link"}
          </Button>
        )
      }
    >
      {sent ? (
        <>
          Check your inbox. We&apos;ve emailed a link to <span className="break-all">{email}</span> to set a new
          password.
        </>
      ) : error ? (
        <span role="alert">{error}</span>
      ) : (
        <>
          We can email a link to <span className="break-all">{email}</span> so you can set a new one.
        </>
      )}
    </Notice>
  );
}

export function ChangePasswordForm({ email, minLength }: { email: string; minLength: number }) {
  const [state, formAction, pending] = useActionState(changePassword, initial);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  if (state?.ok) {
    return (
      <>
        <Notice icon={CircleCheck} title="Password changed">
          Use your new password next time you sign in.
        </Notice>
        <ButtonLink href="/dashboard/settings" variant="secondary" size="lg" full>
          Back to settings
        </ButtonLink>
      </>
    );
  }

  const failed = state && !state.ok ? state : null;
  const strength = passwordStrength(next, minLength);
  const mismatch = confirm.length > 0 && next.length > 0 && confirm !== next;

  return (
    <>
      <form action={formAction} className="flex flex-col gap-3.5">
        <Field label="Current password" htmlFor="current-password">
          <PasswordInput
            id="current-password"
            name="current_password"
            icon={Lock}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            invalid={failed?.field === "current"}
            disabled={pending}
          />
        </Field>

        <Field label="New password" htmlFor="new-password" help={strength.hint}>
          <PasswordInput
            id="new-password"
            name="new_password"
            icon={Lock}
            revealable
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby="new-password-help"
            required
            invalid={failed?.field === "new"}
            disabled={pending}
          />
          <StrengthBar score={strength.score} />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirm-password"
          help={mismatch ? "These don't match yet." : undefined}
        >
          <PasswordInput
            id="confirm-password"
            name="confirm_password"
            icon={Lock}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-describedby={mismatch ? "confirm-password-help" : undefined}
            required
            invalid={failed?.field === "confirm"}
            disabled={pending}
          />
        </Field>

        {failed && <FormAlert>{failed.error}</FormAlert>}

        <Button type="submit" size="lg" full disabled={pending}>
          {pending ? "Changing your password…" : "Change password"}
        </Button>
      </form>

      <ForgottenPassword email={email} />
    </>
  );
}
