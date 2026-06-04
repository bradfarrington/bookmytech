import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardHeader } from "../_components/dashboard-header";
import { SettingsForm } from "./_components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-dvh bg-surface">
      <DashboardHeader name={profile?.full_name ?? user.email ?? ""} avatarUrl={profile?.avatar_url ?? null} />

      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} />
          Back to dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-text-primary">Account settings</h1>
          <p className="text-text-secondary">Manage your details and preferences.</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface-card p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-muted">Your details</h2>
          <SettingsForm
            defaultName={profile?.full_name ?? ""}
            defaultPhone={profile?.phone ?? ""}
            email={user.email ?? ""}
          />
        </div>

        {/* Payment methods + addresses + notification preferences are managed at
            booking time for now; richer management lands with the partial-deposit
            + saved-cards work. Surface them as a clear placeholder rather than a
            dead link. */}
        <div className="rounded-2xl border border-dashed border-border bg-surface-card p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">Payment &amp; notifications</h2>
          <p className="mt-2 text-sm text-text-secondary">
            Saved cards, addresses and notification preferences are coming soon.
            For now your card is entered securely at booking time, and we&apos;ll
            email and text you booking updates.
          </p>
        </div>
      </main>
    </div>
  );
}
