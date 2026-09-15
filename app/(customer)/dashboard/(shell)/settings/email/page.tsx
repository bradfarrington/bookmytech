import { redirect } from "next/navigation";
import { PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { createClient } from "@/lib/supabase/server";
import { ScreenIntro } from "../_components/screen-intro";
import { ChangeEmailForm } from "./_components/change-email-form";

// Change email (Task 48, mockup 05 "Change email"). The change itself happens
// in the browser (see ChangeEmailForm). `user.new_email` is Supabase's record
// of a change still waiting for its confirmation links, so the waiting card
// survives a reload.
//
// No password field, unlike the mockup: the request goes from the browser
// straight to Supabase with the signed-in session, so a password check in
// front of it could be skipped and would protect nothing. What does protect
// the account is Secure Email Change: the current address has to confirm too.

export default async function ChangeEmailPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const current = user.email ?? "";

  return (
    <Screen>
      <PageHeader title="Change email" backHref="/dashboard/settings" />
      <Stack>
        <ScreenIntro title="Change your email.">
          You currently sign in as <span className="break-all font-bold text-text-primary">{current}</span>. This
          is also where your booking emails go.
        </ScreenIntro>
        <ChangeEmailForm currentEmail={current} pendingEmail={user.new_email ?? null} />
      </Stack>
    </Screen>
  );
}
