"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReminderPrefsState = { ok: true } | { error: string } | null;

// Customer reminder-preference update (Task 11 Stage 1, push added in Task 48).
// A signed-in customer toggles whether they get service reminders and on which
// channels: email, SMS and push to the customer app (profiles.reminder_via_push,
// 0050). Written through the service-role client after confirming the session,
// because profiles has no customer self-UPDATE policy for these columns.
//
// Checkbox semantics: email and SMS are on when the form sends "on" and off
// when it sends nothing. Push is only written when the form sends the field at
// all ("on" or "off"), so a form that doesn't know about push leaves it alone.
export async function updateReminderPreferences(
  _prev: ReminderPrefsState,
  formData: FormData,
): Promise<ReminderPrefsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again to change your reminders." };

  const update: Record<string, boolean> = {
    reminders_enabled: formData.get("reminders_enabled") === "on",
    // When reminders are off the channel flags are irrelevant; keep whatever
    // the form sent so re-enabling restores their last choice.
    reminder_via_email: formData.get("reminder_via_email") === "on",
    reminder_via_sms: formData.get("reminder_via_sms") === "on",
  };
  const push = formData.get("reminder_via_push");
  if (push !== null) update.reminder_via_push = push === "on";

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", user.id);

  if (error) {
    console.error("[reminders] preference update failed", user.id, error.message);
    return { error: "We couldn't save your reminder settings. Please try again." };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}
