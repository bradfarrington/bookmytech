"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findPackage } from "@/lib/sms/packages";
import { sendSms } from "@/lib/sms/send-sms";
import { siteUrl } from "@/lib/utils";

// Admin SMS controls (Task 13 Stage B). Mutations verify the caller is an admin
// (RLS-aware client) then write via the service-role client, mirroring the
// pricing actions. The buy-credits checkout is created server-side so the price
// can never come from the browser — it only names a package.

export type SmsResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin")
    return { ok: false as const, error: "Admins only." };
  return { ok: true as const, adminId: user.id };
}

function gocardlessBaseUrl(): string {
  return process.env.GOCARDLESS_ENVIRONMENT === "live"
    ? "https://api.gocardless.com"
    : "https://api-sandbox.gocardless.com";
}

// GoCardless returns structured validation errors[]; join them so the admin
// sees what's actually wrong, not the useless top-level summary.
function formatGoCardlessError(payload: {
  error?: { message?: string; errors?: { field?: string; request_pointer?: string; message?: string }[] };
}): string {
  const errs = payload?.error?.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    return errs
      .map((e) => `${e.field || e.request_pointer || "request"}: ${e.message}`)
      .join("; ");
  }
  return payload?.error?.message || "GoCardless request failed";
}

// ── Buy credits: GoCardless Instant Bank Pay (billing request + flow) ────────
export async function createCheckout(
  credits: number,
): Promise<{ ok: true; checkoutUrl: string } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const pkg = findPackage(credits);
  if (!pkg) return { ok: false, error: "Invalid credit package." };

  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "GoCardless is not configured." };

  const base = gocardlessBaseUrl();
  const apiVersion = process.env.GOCARDLESS_API_VERSION || "2015-07-06";
  const headers = {
    Authorization: `Bearer ${token}`,
    "GoCardless-Version": apiVersion,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // 1) Billing request (payment_request — Faster Payments / Instant Bank Pay).
  const brRes = await fetch(`${base}/billing_requests`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      billing_requests: {
        payment_request: {
          amount: pkg.pricePence,
          currency: "GBP",
          description: `${pkg.credits} SMS Credits`,
          scheme: "faster_payments",
          metadata: { product: "sms_credits", credits: String(pkg.credits) },
        },
      },
    }),
  });
  const brData = await brRes.json();
  if (!brRes.ok) {
    console.error("GoCardless billing_requests error", brData);
    return { ok: false, error: formatGoCardlessError(brData) };
  }
  const billingRequestId = brData?.billing_requests?.id;
  if (!billingRequestId) {
    return { ok: false, error: "GoCardless did not return a billing request id." };
  }

  // 2) Billing request flow → hosted authorisation URL.
  const origin = siteUrl();
  const flowRes = await fetch(`${base}/billing_request_flows`, {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({
      billing_request_flows: {
        redirect_uri: `${origin}/admin/sms?purchase=success`,
        exit_uri: `${origin}/admin/sms?purchase=cancelled`,
        links: { billing_request: billingRequestId },
      },
    }),
  });
  const flowData = await flowRes.json();
  if (!flowRes.ok) {
    console.error("GoCardless billing_request_flows error", flowData);
    return { ok: false, error: formatGoCardlessError(flowData) };
  }

  const checkoutUrl = flowData?.billing_request_flows?.authorisation_url;
  if (!checkoutUrl) return { ok: false, error: "No authorisation URL returned." };
  return { ok: true, checkoutUrl };
}

// ── Test send ────────────────────────────────────────────────────────────────
export async function sendTestSms(phone: string): Promise<SmsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const trimmed = phone.trim();
  if (!trimmed) return { ok: false, error: "Enter a phone number." };

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("sms_settings")
    .select("sms_enabled, sms_credits_balance")
    .eq("id", 1)
    .single();
  if (!settings?.sms_enabled)
    return { ok: false, error: "SMS is disabled. Enable it first." };
  if ((settings.sms_credits_balance ?? 0) < 1)
    return { ok: false, error: "No SMS credits remaining. Buy more first." };

  const sent = await sendSms({
    to: trimmed,
    body: "Test SMS from Book My Tech — your SMS notifications are working.",
  });
  if (!sent)
    return { ok: false, error: "Twilio rejected the message — check the number and sender." };

  revalidatePath("/admin/sms");
  return { ok: true };
}

// ── Settings mutations ───────────────────────────────────────────────────────
export async function setSmsEnabled(enabled: boolean): Promise<SmsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { error } = await admin
    .from("sms_settings")
    .update({ sms_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sms");
  return { ok: true };
}

export async function saveSmsSender(input: {
  senderName: string;
  fromNumber: string;
}): Promise<SmsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const senderName = input.senderName.trim();
  // Twilio alphanumeric sender id: 1-11 chars, letters/numbers (and spaces are
  // not allowed). Empty is allowed (falls back to the number / default).
  if (senderName && !/^[A-Za-z0-9]{1,11}$/.test(senderName)) {
    return { ok: false, error: "Sender name must be 1-11 letters/numbers, no spaces." };
  }
  const fromNumber = input.fromNumber.trim();

  const admin = createAdminClient();
  const { error } = await admin
    .from("sms_settings")
    .update({
      sms_sender_name: senderName || null,
      sms_from_number: fromNumber || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sms");
  return { ok: true };
}

export async function saveLowCreditEmail(email: string): Promise<SmsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const trimmed = email.trim();
  if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sms_settings")
    .update({ low_credit_alert_email: trimmed || null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/sms");
  return { ok: true };
}
