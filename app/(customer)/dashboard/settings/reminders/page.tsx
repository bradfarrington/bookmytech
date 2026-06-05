import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardHeader } from "../../_components/dashboard-header";
import { RemindersForm } from "./_components/reminders-form";

export const dynamic = "force-dynamic";

export default async function ReminderSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url, reminders_enabled, reminder_via_email, reminder_via_sms")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-dvh bg-surface">
      <DashboardHeader name={profile?.full_name ?? user.email ?? ""} avatarUrl={profile?.avatar_url ?? null} />

      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} />
          Back to settings
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-text-primary">Reminders</h1>
          <p className="text-text-secondary">
            Stay ahead of your car&apos;s MOT, annual service and seasonal checks.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface-card p-6">
          <RemindersForm
            defaultEnabled={profile?.reminders_enabled ?? true}
            defaultEmail={profile?.reminder_via_email ?? true}
            defaultSms={profile?.reminder_via_sms ?? false}
          />
        </div>
      </main>
    </div>
  );
}
