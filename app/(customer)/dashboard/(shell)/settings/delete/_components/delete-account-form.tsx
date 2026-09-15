"use client";

import { useActionState, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { deleteAccount, type AccountDeletionState } from "@/app/actions/customer-account";
import { Button, ButtonLink } from "@/components/dashboard/ui";
import { Field, FormAlert, PasswordInput } from "../../_components/field";

// The password confirms it's them; the action checks it, runs the deletion and,
// on success, signs this browser out and sends them to the homepage.

const initial: AccountDeletionState = null;

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, initial);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <Field label="Your password" htmlFor="delete-password">
        <PasswordInput
          id="delete-password"
          name="password"
          icon={Lock}
          placeholder="To confirm it's you"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          invalid={!!state?.error}
          disabled={pending}
        />
      </Field>

      {state?.error && <FormAlert>{state.error}</FormAlert>}

      <div className="flex flex-col gap-2 pt-1">
        <Button type="submit" variant="destructive" size="lg" full icon={Trash2} disabled={pending || !password}>
          {pending ? "Deleting your account…" : "Delete my account"}
        </Button>
        <ButtonLink href="/dashboard/settings" variant="ghost" full>
          Keep my account
        </ButtonLink>
      </div>
    </form>
  );
}
