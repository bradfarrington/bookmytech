"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { updateReminderPreferences } from "@/app/actions/reminders";
import { Toggle } from "@/components/dashboard/toggle";
import { ListCard, ListRow, Section } from "@/components/dashboard/ui";

// The switches save as they're flipped, like the app. Every save sends all four
// values, so the last one to land is the whole truth. A failed save puts the
// switch back and says why.

export interface ReminderPrefs {
  enabled: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

function toFormData(prefs: ReminderPrefs): FormData {
  const form = new FormData();
  if (prefs.enabled) form.set("reminders_enabled", "on");
  if (prefs.email) form.set("reminder_via_email", "on");
  if (prefs.sms) form.set("reminder_via_sms", "on");
  form.set("reminder_via_push", prefs.push ? "on" : "off");
  return form;
}

export function ReminderSettings({
  initial,
  email,
  phone,
}: {
  initial: ReminderPrefs;
  email: string | null;
  phone: string | null;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  function change(patch: Partial<ReminderPrefs>) {
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    startTransition(async () => {
      const result = await updateReminderPreferences(null, toFormData(next));
      if (result && "error" in result) {
        setPrefs(previous);
        toast.error(result.error);
      }
    });
  }

  const channelsOff = !prefs.enabled;

  return (
    <>
      <ListCard>
        <ListRow
          icon={Bell}
          title="Send me reminders"
          caption="Turn everything off with one switch."
          trailing={
            <Toggle checked={prefs.enabled} onChange={(v) => change({ enabled: v })} label="Send me reminders" />
          }
        />
      </ListCard>

      <Section title="How we reach you" className="mt-1.5">
        <ListCard>
          <ListRow
            icon={Smartphone}
            title="Push notification"
            caption="In the Book My Tech app."
            trailing={
              <Toggle
                checked={prefs.push}
                onChange={(v) => change({ push: v })}
                disabled={channelsOff}
                label="Push notification reminders"
              />
            }
          />
          <ListRow
            icon={Mail}
            title="Email"
            caption={email ? <span className="break-all">To {email}.</span> : "To your email address."}
            trailing={
              <Toggle
                checked={prefs.email}
                onChange={(v) => change({ email: v })}
                disabled={channelsOff}
                label="Email reminders"
              />
            }
          />
          <ListRow
            icon={MessageSquare}
            title="Text message"
            caption={
              phone ? (
                `To ${phone}.`
              ) : (
                <>
                  Add a mobile number in{" "}
                  <Link href="/dashboard/settings" className="font-semibold text-brand-blue hover:text-brand-blue-dark">
                    Your details
                  </Link>
                  .
                </>
              )
            }
            trailing={
              <Toggle
                checked={phone ? prefs.sms : false}
                onChange={(v) => change({ sms: v })}
                disabled={channelsOff || !phone}
                label="Text message reminders"
              />
            }
          />
        </ListCard>
      </Section>
    </>
  );
}
