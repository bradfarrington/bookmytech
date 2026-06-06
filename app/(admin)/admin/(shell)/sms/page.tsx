import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Overline } from "@/components/ui/overline";
import { CREDIT_PACKAGES } from "@/lib/sms/packages";
import { SmsPanel, type SmsSettings, type PurchaseRow } from "./_components/sms-panel";

export const dynamic = "force-dynamic";

export default async function AdminSmsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const [{ data: settings }, { data: purchases }] = await Promise.all([
    admin
      .from("sms_settings")
      .select(
        "sms_enabled, sms_credits_balance, sms_sender_name, sms_from_number, low_credit_alert_email",
      )
      .eq("id", 1)
      .single(),
    admin
      .from("sms_credit_purchases")
      .select("id, credits_purchased, amount_paid_pence, status, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const s: SmsSettings = {
    smsEnabled: settings?.sms_enabled ?? false,
    balance: settings?.sms_credits_balance ?? 0,
    senderName: settings?.sms_sender_name ?? "",
    fromNumber: settings?.sms_from_number ?? "",
    // Pre-populate the alert recipient with the signed-in admin's email so a
    // first save captures the right address.
    lowCreditEmail: settings?.low_credit_alert_email ?? user?.email ?? "",
  };

  return (
    <div className="space-y-10">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">SMS</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Prepaid SMS credits power booking updates, reminders and message
          nudges. Buy credits, set your sender ID, send a test, and watch the
          balance. Each delivered text costs one credit; email always sends
          regardless.
        </p>
      </header>

      <SmsPanel
        settings={s}
        packages={CREDIT_PACKAGES.map((p) => ({ ...p }))}
        purchases={(purchases ?? []) as PurchaseRow[]}
      />
    </div>
  );
}
