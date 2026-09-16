import { redirect } from "next/navigation";
import { PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { createClient } from "@/lib/supabase/server";
import { pendingEmailChangeFor } from "@/lib/account/email-change";
import { ScreenIntro } from "../_components/screen-intro";
import { ChangeEmailForm } from "./_components/change-email-form";

// Change email (Task 48, mockup 05 "Change email"; rebuilt first-party in
// Task 58). The change is a server action over lib/account/email-change.ts; the
// waiting card comes from our own `pending_email_changes` row rather than
// Supabase's `user.new_email`, so it survives a reload as it did before.
//
// The mockup's password field is here and load-bearing. It was dropped in Task
// 48 for a good reason at the time — the request went from the browser straight
// to Supabase carrying the session, so a check in front of it protected nothing.
// Now the check happens server-side before any email is sent.

export default async function ChangeEmailPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const current = user.email ?? "";
  const pending = await pendingEmailChangeFor(user.id);

  return (
    <Screen>
      <PageHeader title="Change email" backHref="/dashboard/settings" />
      <Stack>
        <ScreenIntro title="Change your email.">
          You currently sign in as <span className="break-all font-bold text-text-primary">{current}</span>. This
          is also where your booking emails go.
        </ScreenIntro>
        <ChangeEmailForm currentEmail={current} pendingEmail={pending?.newEmail ?? null} />
      </Stack>
    </Screen>
  );
}
