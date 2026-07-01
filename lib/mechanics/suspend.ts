import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { siteUrl } from "@/lib/utils";

type Admin = ReturnType<typeof createAdminClient>;

// Shared suspension primitives, used by the admin actions AND the auto-suspend
// path in dispute arbitration. Suspending records a history row, flips the live
// dispatch gate (is_suspended / suspended_until), takes the mechanic offline so
// they immediately stop receiving offers, and emails them. Lifting reverses it.

async function mechanicEmail(admin: Admin, mechanicId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(mechanicId);
  return data.user?.email ?? null;
}

export async function applySuspension(
  admin: Admin,
  mechanicId: string,
  reason: string,
  suspendedUntil: string | null,
  byId: string | null,
): Promise<void> {
  await admin.from("mechanic_suspensions").insert({
    mechanic_id: mechanicId,
    reason,
    suspended_by: byId,
    suspended_until: suspendedUntil,
  });
  await admin
    .from("mechanics")
    .update({ is_suspended: true, suspended_until: suspendedUntil, status: "offline" })
    .eq("id", mechanicId);

  const email = await mechanicEmail(admin, mechanicId);
  if (email) {
    const untilLine = suspendedUntil
      ? `Your account is suspended until ${new Date(suspendedUntil).toLocaleDateString("en-GB", { dateStyle: "long" })}.`
      : "Your account is suspended pending review.";
    renderTemplateEmail("mechanic_suspended", {
      until_line: untilLine,
      reason,
      dashboard_url: `${siteUrl()}/mechanic`,
    })
      .then(({ subject, html }) => sendEmail({ to: email, subject, html }))
      .catch((e) => console.error("suspension email failed", e));
  }
}

export async function liftMechanicSuspension(
  admin: Admin,
  mechanicId: string,
  byId: string | null,
): Promise<void> {
  // Stamp the most recent un-lifted suspension as lifted.
  const { data: active } = await admin
    .from("mechanic_suspensions")
    .select("id")
    .eq("mechanic_id", mechanicId)
    .is("lifted_at", null)
    .order("suspended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) {
    await admin
      .from("mechanic_suspensions")
      .update({ lifted_at: new Date().toISOString(), lifted_by: byId })
      .eq("id", active.id);
  }
  await admin
    .from("mechanics")
    .update({ is_suspended: false, suspended_until: null })
    .eq("id", mechanicId);

  const email = await mechanicEmail(admin, mechanicId);
  if (email) {
    renderTemplateEmail("mechanic_suspension_lifted", {
      dashboard_url: `${siteUrl()}/mechanic`,
    })
      .then(({ subject, html }) => sendEmail({ to: email, subject, html }))
      .catch((e) => console.error("lift email failed", e));
  }
}
