"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  updateReminderPreferences,
  type ReminderPrefsState,
} from "@/app/actions/reminders";

const initial: ReminderPrefsState = null;

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    // When `disabled` (reminders off) we dim + block interaction via the wrapper
    // rather than the input's `disabled` attribute — a disabled checkbox isn't
    // submitted, which would silently wipe the channel choice. Keeping the input
    // enabled preserves the last-picked channels for when reminders are re-enabled.
    <label
      className={`flex items-start justify-between gap-4 py-3 ${
        disabled ? "pointer-events-none opacity-40" : "cursor-pointer"
      }`}
      aria-disabled={disabled}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>}
      </span>
      {/* The visible switch is driven by React state; a hidden checkbox carries
          the on/off into the form action. */}
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)} tabIndex={disabled ? -1 : 0} className="sr-only" />
      <span
        aria-hidden
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-brand-blue" : "bg-border"
        }`}
      >
        <span className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </label>
  );
}

export function RemindersForm({
  defaultEnabled,
  defaultEmail,
  defaultSms,
}: {
  defaultEnabled: boolean;
  defaultEmail: boolean;
  defaultSms: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateReminderPreferences, initial);
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [email, setEmail] = useState(defaultEmail);
  const [sms, setSms] = useState(defaultSms);

  useEffect(() => {
    if (state && "ok" in state && state.ok) toast.success("Reminder preferences saved.");
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col">
      <Toggle
        name="reminders_enabled"
        label="Service reminders"
        hint="We'll let you know when your MOT, service or seasonal checks are due."
        checked={enabled}
        onChange={setEnabled}
      />

      <div className="border-t border-border" />

      <Toggle
        name="reminder_via_email"
        label="Email"
        checked={email}
        onChange={setEmail}
        disabled={!enabled}
      />
      <Toggle
        name="reminder_via_sms"
        label="Text message"
        hint="SMS reminders are rolling out soon — turn this on to opt in."
        checked={sms}
        onChange={setSms}
        disabled={!enabled}
      />

      <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-4 self-start">
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
