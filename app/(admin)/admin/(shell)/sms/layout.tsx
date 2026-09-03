import { Overline } from "@/components/ui/overline";
import { SmsTabs } from "./_components/sms-tabs";

export default function SmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-8">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">SMS</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Prepaid SMS credits power booking updates, reminders and message
          nudges. Buy credits, edit the message templates, send one-off texts,
          and review what&apos;s been sent. Each delivered text costs one credit.
          Any text — and any email, under Emails — can be switched off from its
          template.
        </p>
      </header>
      <SmsTabs />
      {children}
    </div>
  );
}
