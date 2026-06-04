"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateCustomerProfile, type ProfileState } from "@/app/actions/customer-profile";

const initial: ProfileState = null;

export function SettingsForm({
  defaultName,
  defaultPhone,
  email,
}: {
  defaultName: string;
  defaultPhone: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(updateCustomerProfile, initial);

  useEffect(() => {
    if (state?.ok) toast.success("Your details have been saved.");
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Full name</span>
        <input
          type="text"
          name="full_name"
          defaultValue={defaultName}
          required
          disabled={pending}
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Email</span>
        <input
          type="email"
          value={email}
          disabled
          readOnly
          className="h-11 cursor-not-allowed rounded-button border border-border bg-surface px-3.5 text-sm text-text-muted"
        />
        <span className="text-xs text-text-muted">Email changes aren&apos;t supported yet — contact support to update it.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-text-primary">Mobile number</span>
        <input
          type="tel"
          name="phone"
          defaultValue={defaultPhone}
          placeholder="07…"
          disabled={pending}
          className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary placeholder:text-text-disabled focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-50"
        />
        <span className="text-xs text-text-muted">Used for booking updates and SMS notifications.</span>
      </label>

      <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-2 self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
