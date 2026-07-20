"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderMechanicInviteEmail } from "@/emails/mechanic-invite";
import { ensureMechanicAccount } from "@/lib/mechanics/provision";

export type MechanicActionResult = { error?: string } | void;

interface ParsedMechanicForm {
  email: string;
  fullName: string;
  phone: string | null;
  basePostcode: string | null;
  serviceRadiusMiles: number;
  specialisms: string[];
  bio: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Outward code only — sufficient for dispatch matching (matches the
// derive_postcode_district() function in 0004). Full postcode optional.
const POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?(\s?[0-9][A-Z]{2})?$/i;

function parseForm(formData: FormData): { ok: true; data: ParsedMechanicForm } | { ok: false; error: string } {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const basePostcodeRaw = String(formData.get("base_postcode") ?? "").trim().toUpperCase();
  const radiusRaw = String(formData.get("service_radius_miles") ?? "");
  const bioRaw = String(formData.get("bio") ?? "").trim();
  const specialisms = formData.getAll("specialisms").map(String).filter(Boolean);

  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!fullName) return { ok: false, error: "Full name is required." };

  const serviceRadiusMiles = radiusRaw === "" ? 10 : Number.parseInt(radiusRaw, 10);
  if (!Number.isFinite(serviceRadiusMiles) || serviceRadiusMiles < 1 || serviceRadiusMiles > 100) {
    return { ok: false, error: "Service radius must be between 1 and 100 miles." };
  }

  if (basePostcodeRaw && !POSTCODE_RE.test(basePostcodeRaw)) {
    return { ok: false, error: "That doesn't look like a valid UK postcode." };
  }

  return {
    ok: true,
    data: {
      email,
      fullName,
      phone: phoneRaw || null,
      basePostcode: basePostcodeRaw || null,
      serviceRadiusMiles,
      specialisms,
      bio: bioRaw || null,
    },
  };
}

export async function createMechanicAction(
  formData: FormData,
): Promise<MechanicActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  // Verify the caller is an admin via the user-scoped client (RLS-aware).
  // The actual writes use the service-role client because creating an
  // auth.users row + flipping the profile to role='mechanic' both require it.
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: callerProfile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return { error: "Only admins can create mechanics." };
  }

  const admin = createAdminClient();

  // Steps 1-3 — create the auth user (or reuse an existing customer/admin
  // account), set the profile, insert the mechanics row. Shared with the
  // application-approval flow — see lib/mechanics/provision.ts.
  const account = await ensureMechanicAccount(admin, {
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone,
    basePostcode: parsed.data.basePostcode,
    serviceRadiusMiles: parsed.data.serviceRadiusMiles,
    specialisms: parsed.data.specialisms,
    bio: parsed.data.bio,
  });
  if (!account.ok) return { error: account.error };

  // Step 4 — generate a set-password (recovery) link and email it. We never
  // enable Supabase's built-in mailer; the link goes through our MJML template
  // + Resend wrapper. Redeemed in /auth/callback, it lands the mechanic on
  // /mechanic/set-password to choose a password (then email + password login).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const redirectTo = `${siteUrl}/auth/callback?next=/mechanic/set-password`;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: parsed.data.email,
    options: { redirectTo },
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    // The mechanic exists — they just won't get the invite email. Admin can
    // re-send via a future "Resend invite" button. Don't roll back the whole
    // create — that would be worse.
    console.error("Failed to generate set-password link", linkErr);
    revalidatePath("/admin/mechanics");
    redirect(`/admin/mechanics?flash=mechanic-created&email_warning=1`);
  }

  // Build our own callback URL keyed by the token hash rather than emailing
  // Supabase's raw action_link. The raw link hits /auth/v1/verify, which
  // returns tokens in the URL fragment (implicit flow) — invisible to our
  // server-side callback route. A token_hash link lets the callback redeem
  // the session server-side via verifyOtp and set the SSR cookies.
  const actionLink = `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(
    linkData.properties.hashed_token,
  )}&type=recovery&next=/mechanic/set-password`;

  const { subject, html } = await renderMechanicInviteEmail({
    name: parsed.data.fullName,
    actionLink,
  });

  await sendEmail({ to: parsed.data.email, subject, html }).catch((err) => {
    // Same logic as the link-gen failure — log and move on, mechanic still exists.
    console.error("Failed to send invite email", err);
  });

  revalidatePath("/admin/mechanics");
  redirect(`/admin/mechanics?flash=mechanic-created`);
}

export async function setMechanicStatusAction(
  id: string,
  status: "online" | "offline" | "on_job",
): Promise<MechanicActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("mechanics").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/mechanics");
}
