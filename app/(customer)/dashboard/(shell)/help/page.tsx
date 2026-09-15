import { PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { ScreenIntro } from "../settings/_components/screen-intro";
import { HelpCentre } from "./_components/help-centre";

// Help centre (Task 48, mockup 05 "Help centre"). The same FAQs as the public
// /help page (app/(customer)/help/faqs.ts). Email is the only contact route:
// there is no chat and no phone line, so the mockup's cards for those are left
// out. The shell layout has already checked the session.

export default function DashboardHelpPage() {
  return (
    <Screen>
      <PageHeader title="Help centre" backHref="/dashboard/settings" />
      <Stack>
        <ScreenIntro title="How can we help?">
          Answers to common questions, or an email to our support team.
        </ScreenIntro>
        <HelpCentre />
      </Stack>
    </Screen>
  );
}
