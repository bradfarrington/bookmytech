import { redirect } from "next/navigation";
import { Caption, PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { createClient } from "@/lib/supabase/server";
import { ReminderSettings } from "./_components/reminder-settings";

// Service reminders (Task 48, mockup 02 "Service reminders"): the master switch
// and the three channels the reminder sender honours
// (app/api/cron/send-reminders): push to the app, email, and SMS when there's a
// mobile number on the profile.

interface ReminderProfileRow {
  phone: string | null;
  reminders_enabled: boolean | null;
  reminder_via_email: boolean | null;
  reminder_via_sms: boolean | null;
  reminder_via_push: boolean | null;
}

export default async function ReminderSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("phone, reminders_enabled, reminder_via_email, reminder_via_sms, reminder_via_push")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as ReminderProfileRow | null;

  // The same defaults as the sender uses for a missing value.
  const initial = {
    enabled: profile?.reminders_enabled ?? true,
    email: profile?.reminder_via_email ?? true,
    sms: profile?.reminder_via_sms ?? false,
    push: profile?.reminder_via_push ?? true,
  };

  return (
    <Screen>
      <PageHeader title="Service reminders" backHref="/dashboard/settings" />
      <Stack>
        <p className="text-sm leading-5 text-text-secondary">
          We&apos;ll let you know when your MOT or service is coming up, so nothing creeps up on you.
        </p>
        <ReminderSettings initial={initial} email={user.email ?? null} phone={profile?.phone?.trim() || null} />
        <Caption className="text-center">You can change these any time.</Caption>
      </Stack>
    </Screen>
  );
}
