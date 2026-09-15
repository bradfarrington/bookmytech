import { redirect } from "next/navigation";
import { FileClock, Mail, Trash2, TriangleAlert, UserX, Wallet } from "lucide-react";
import { ListCard, ListRow, Notice, PageHeader, Screen, Section, Stack, Tile } from "@/components/dashboard/ui";
import { createClient } from "@/lib/supabase/server";
import { ScreenIntro } from "../_components/screen-intro";
import { DeleteAccountForm } from "./_components/delete-account-form";

// Delete account (Task 48, mockup 05 "Delete account"). The web wrapper over
// deleteCustomerAccountFor (lib/account/delete-account.ts). "What happens" must
// stay true to that core and to delete_customer_account (0065, 0077): the
// profile is anonymised, bookings keep their records without the email and
// phone, what is only the customer's is deleted, every session is revoked, and
// the real address is freed. The refusals are in lib/account/blockers.ts.

export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <Screen>
      <PageHeader title="Delete account" backHref="/dashboard/settings" />
      <Stack>
        <ScreenIntro title="Delete your account?">
          This removes your sign-in and your details from Book My Tech. It can&apos;t be undone.
        </ScreenIntro>

        <Section title="What happens">
          <ListCard>
            <ListRow
              leading={<Tile icon={UserX} tone="danger" size="sm" />}
              title="You're signed out everywhere"
              caption="Straight away, on this device and every other, and app notifications stop."
            />
            <ListRow
              leading={<Tile icon={Trash2} tone="danger" size="sm" />}
              title="Your saved details are deleted"
              caption="Saved addresses, your garage, saved cards, reminders not yet sent and what you've read in your inbox."
            />
            <ListRow
              leading={<Tile icon={Wallet} tone="danger" size="sm" />}
              title="Unused credit is lost"
              caption="Any account credit you haven't spent goes with the account."
            />
            <ListRow
              leading={<Tile icon={FileClock} tone="warn" size="sm" />}
              title="Past bookings are kept as records"
              caption="With your email address and phone number taken off them."
            />
            <ListRow
              leading={<Tile icon={Mail} tone="brand" size="sm" />}
              title="Your email address is freed up"
              caption="We'll send one last email to confirm, and you can use the address to sign up again."
            />
          </ListCard>
        </Section>

        <Notice tone="warn" icon={TriangleAlert} title="Got a job on the go?">
          A booking in progress, an open dispute or a quote waiting for your answer needs sorting first. Once
          your account is deleted, you can&apos;t report a problem with a recent job.
        </Notice>

        <DeleteAccountForm />
      </Stack>
    </Screen>
  );
}
