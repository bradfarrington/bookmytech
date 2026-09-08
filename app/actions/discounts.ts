"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { grantCredit } from "@/lib/credits/credits";
import { siteUrl } from "@/lib/utils";
import { normalisePromoCode, promoOfferLabel, PROMO_CODE_RE } from "@/lib/promos/validate";

// Discount codes the admin creates and sends out (Task 35). Every write goes
// through the service-role client after an admin check; the codes themselves
// are admin-only under RLS, and customers only ever meet one by typing it at
// checkout.

export type DiscountResult = { ok: true } | { ok: false; error: string };
export type DiscountCreateResult = { ok: true; id: string } | { ok: false; error: string };

const MAX_RECIPIENTS = 200;

async function requireAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };
  return { ok: true, adminId: user.id };
}

export interface PromoCodeInput {
  code: string;
  kind: "percent" | "fixed";
  /** percent: 1–100. fixed: pence. */
  value: number;
  description?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  perCustomerLimit?: number | null;
  minTotalPence?: number | null;
  isActive?: boolean;
}

type CleanedPromo = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  description: string | null;
  starts_at: string;
  expires_at: string | null;
  max_redemptions: number | null;
  per_customer_limit: number;
  min_total_pence: number;
  is_active: boolean;
};

function clean(input: PromoCodeInput): { ok: true; row: CleanedPromo } | { ok: false; error: string } {
  const code = normalisePromoCode(input.code);
  if (!PROMO_CODE_RE.test(code))
    return { ok: false, error: "A code is 3–24 letters, numbers or hyphens — no spaces." };
  if (input.kind !== "percent" && input.kind !== "fixed") return { ok: false, error: "Choose percent or fixed." };

  const value = Math.round(Number(input.value));
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Enter the amount the code takes off." };
  if (input.kind === "percent" && value > 100) return { ok: false, error: "A percentage can't be more than 100." };

  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "That start date isn't valid." };
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { ok: false, error: "That expiry date isn't valid." };
  if (expiresAt && expiresAt <= startsAt) return { ok: false, error: "The expiry has to be after the start." };

  const max = input.maxRedemptions == null || input.maxRedemptions === 0 ? null : Math.round(Number(input.maxRedemptions));
  if (max != null && (!Number.isFinite(max) || max <= 0)) return { ok: false, error: "Leave the total limit blank for unlimited." };
  const perCustomer = Math.round(Number(input.perCustomerLimit ?? 1));
  if (!Number.isFinite(perCustomer) || perCustomer <= 0) return { ok: false, error: "Each customer needs at least one use." };
  const minTotal = Math.round(Number(input.minTotalPence ?? 0));
  if (!Number.isFinite(minTotal) || minTotal < 0) return { ok: false, error: "The minimum booking value can't be negative." };

  return {
    ok: true,
    row: {
      code,
      kind: input.kind,
      value,
      description: (input.description ?? "").trim() || null,
      starts_at: startsAt.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      max_redemptions: max,
      per_customer_limit: perCustomer,
      min_total_pence: minTotal,
      is_active: input.isActive ?? true,
    },
  };
}

function revalidate(id?: string) {
  revalidatePath("/admin/discounts");
  if (id) revalidatePath(`/admin/discounts/${id}`);
}

function duplicateMessage(error: { code?: string; message: string }): string {
  return error.code === "23505" ? "That code already exists." : error.message;
}

export async function createPromoCode(input: PromoCodeInput): Promise<DiscountCreateResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleaned = clean(input);
  if (!cleaned.ok) return cleaned;

  const { data, error } = await createAdminClient()
    .from("promo_codes")
    .insert({ ...cleaned.row, created_by: gate.adminId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error ? duplicateMessage(error) : "Couldn't create the code." };
  revalidate();
  return { ok: true, id: data.id };
}

export async function updatePromoCode(id: string, input: PromoCodeInput): Promise<DiscountResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleaned = clean(input);
  if (!cleaned.ok) return cleaned;

  const { error } = await createAdminClient()
    .from("promo_codes")
    .update({ ...cleaned.row, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: duplicateMessage(error) };
  revalidate(id);
  return { ok: true };
}

export async function setPromoCodeActive(id: string, isActive: boolean): Promise<DiscountResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await createAdminClient()
    .from("promo_codes")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate(id);
  return { ok: true };
}

export interface OfferRecipient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/** Customers to send a code to. Same view and sanitising as /admin/customers. */
export async function searchCustomersForOffer(
  query: string,
): Promise<{ ok: true; customers: OfferRecipient[] } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const search = query.trim().replace(/[,()*\\]/g, "").slice(0, 80);

  let q = createAdminClient()
    .from("customer_admin_summary")
    .select("id, full_name, email, phone")
    .order("joined_at", { ascending: false })
    .limit(50);
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    customers: (data ?? []).map((c) => ({
      id: c.id,
      name: c.full_name ?? "Customer",
      email: c.email ?? null,
      phone: c.phone ?? null,
    })),
  };
}

/**
 * Send a code to a list of customers, one at a time through the ordinary
 * transactional senders (there is no bulk pipeline, deliberately — this is a
 * handful of people, not a marketing blast). Every attempt is logged, so a
 * failure is visible rather than silent.
 */
export async function sendPromoCodeOffer(input: {
  codeId: string;
  customerIds: string[];
  sms?: boolean;
}): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const ids = [...new Set(input.customerIds)].filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "Choose at least one customer." };
  if (ids.length > MAX_RECIPIENTS) return { ok: false, error: `You can send to up to ${MAX_RECIPIENTS} customers at once.` };

  const admin = createAdminClient();
  const { data: code } = await admin
    .from("promo_codes")
    .select("id, code, kind, value, description, expires_at, is_active")
    .eq("id", input.codeId)
    .maybeSingle();
  if (!code) return { ok: false, error: "That code no longer exists." };
  if (!code.is_active) return { ok: false, error: "Switch the code on before sending it." };

  const { data: customers } = await admin
    .from("customer_admin_summary")
    .select("id, full_name, email, phone")
    .in("id", ids);

  let smsAllowed = Boolean(input.sms);
  if (smsAllowed) {
    const { data: settings } = await admin
      .from("sms_settings")
      .select("sms_enabled, sms_credits_balance")
      .eq("id", 1)
      .single();
    if (!settings?.sms_enabled || (settings.sms_credits_balance ?? 0) < ids.length) smsAllowed = false;
  }

  const offer = promoOfferLabel(code);
  const expires = code.expires_at
    ? new Date(code.expires_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      })
    : "";
  const url = `${siteUrl()}/book`;

  let sent = 0;
  let failed = 0;
  for (const customer of customers ?? []) {
    if (customer.email) {
      try {
        const { subject, html } = await renderTemplateEmail("promo_code_offer", {
          name: customer.full_name ?? "there",
          code: code.code,
          offer,
          description: code.description ?? "",
          expires,
          url,
        });
        await sendEmail({ to: customer.email, subject, html });
        sent += 1;
        await admin.from("promo_code_sends").insert({
          code_id: code.id,
          customer_id: customer.id,
          channel: "email",
          sent_by: gate.adminId,
        });
      } catch (err) {
        failed += 1;
        await admin.from("promo_code_sends").insert({
          code_id: code.id,
          customer_id: customer.id,
          channel: "email",
          sent_by: gate.adminId,
          error: err instanceof Error ? err.message : "Send failed",
        });
      }
    }
    if (smsAllowed && customer.phone) {
      try {
        const body = await renderSmsTemplate("promo_code_offer", { code: code.code, offer, url });
        const ok = await sendSms({ to: customer.phone, body });
        await admin.from("promo_code_sends").insert({
          code_id: code.id,
          customer_id: customer.id,
          channel: "sms",
          sent_by: gate.adminId,
          error: ok ? null : "Twilio rejected the message",
        });
      } catch {
        // Logged above on the email leg; an SMS failure never fails the send.
      }
    }
  }

  revalidate(code.id);
  return { ok: true, sent, failed };
}

/**
 * Put credit straight on a customer's account — the one-off "sorry" or
 * "thanks for the repeat custom" that doesn't need a code to type. Uses the
 * ledger's existing `promo` source, which nothing wrote until now.
 */
export async function grantCustomerCredit(input: {
  customerId: string;
  amountPence: number;
  note: string;
}): Promise<DiscountResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const amount = Math.round(Number(input.amountPence));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  if (amount > 50_000) return { ok: false, error: "That's over £500 — check the amount." };
  const note = (input.note ?? "").trim().slice(0, 200) || "Goodwill credit";

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("id", input.customerId).maybeSingle();
  if (!profile) return { ok: false, error: "That customer no longer exists." };

  await grantCredit(admin, input.customerId, amount, "promo", note);
  revalidatePath(`/admin/customers/${input.customerId}`);
  return { ok: true };
}

/** For the customer page's "Send a discount" picker. */
export async function listActivePromoCodes(): Promise<
  { ok: true; codes: Array<{ id: string; code: string; offer: string }> } | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { data } = await createAdminClient()
    .from("promo_codes")
    .select("id, code, kind, value")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return {
    ok: true,
    codes: (data ?? []).map((c) => ({ id: c.id, code: c.code, offer: promoOfferLabel(c) })),
  };
}
