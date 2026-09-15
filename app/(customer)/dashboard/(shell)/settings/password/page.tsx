import { redirect } from "next/navigation";
import { PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/customers/provision";
import { createClient } from "@/lib/supabase/server";
import { ScreenIntro } from "../_components/screen-intro";
import { ChangePasswordForm } from "./_components/change-password-form";

// Change password (Task 48, mockup 05 "Change password"). The current password
// is checked first, without touching this browser's session
// (app/actions/customer-account.ts).

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <Screen>
      <PageHeader title="Change password" backHref="/dashboard/settings" />
      <Stack>
        <ScreenIntro title="Change your password.">You&apos;ll stay signed in on this device.</ScreenIntro>
        <ChangePasswordForm email={user.email ?? ""} minLength={MIN_PASSWORD_LENGTH} />
      </Stack>
    </Screen>
  );
}
