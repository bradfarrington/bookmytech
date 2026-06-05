"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReminderPrefsState = { ok: true } | { error: string } | null;

// Customer reminder-preference update (Task 11 Stage 1). A signed-in customer
// toggles whether they get service reminders and on which channels (email /
// SMS; push is deferred to the native app). Written through the service-role
// client after confirming the session — profiles has no customer self-UPDATE
// policy for these columns.
export async function updateReminderPreferences(
  _prev: ReminderPrefsState,
  formData: FormData,
): Promise<ReminderPrefsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const enabled = formData.get("reminders_enabled") === "on";
  const viaEmail = formData.get("reminder_via_email") === "on";
  const viaSms = formData.get("reminder_via_sms") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      reminders_enabled: enabled,
      // When reminders are off the channel flags are irrelevant; keep whatever
      // the form sent so re-enabling restores their last choice.
      reminder_via_email: viaEmail,
      reminder_via_sms: viaSms,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}
