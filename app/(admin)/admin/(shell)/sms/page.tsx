import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
        "sms_enabled, sms_credits_balance, sms_sender_name, low_credit_alert_email",
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
    // Pre-populate the alert recipient with the signed-in admin's email so a
    // first save captures the right address.
    lowCreditEmail: settings?.low_credit_alert_email ?? user?.email ?? "",
  };

  return (
    <SmsPanel
      settings={s}
      packages={CREDIT_PACKAGES.map((p) => ({ ...p }))}
      purchases={(purchases ?? []) as PurchaseRow[]}
    />
  );
}
