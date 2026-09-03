"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_TEMPLATE_BY_KEY } from "@/emails/registry";
import { isEditableBlock } from "@/emails/blocks";
import { previewTemplateEmail } from "@/emails/resolve";
import { isEmailTemplateLocked } from "@/lib/notifications/locked";
import { clearNotificationToggleCache } from "@/lib/notifications/toggles";

export type EmailTemplateResult = { ok: true } | { ok: false; error: string };

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
  if (profile?.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, adminId: user.id };
}

const MAX_SUBJECT = 200;
const MAX_BLOCK = 2000;

/** Editable block ids for a template (used to reject unknown ids). */
function editableBlockIds(key: string): Set<string> {
  const def = EMAIL_TEMPLATE_BY_KEY[key];
  return new Set((def?.blocks ?? []).filter(isEditableBlock).map((b) => b.id));
}

export async function saveEmailTemplate(input: {
  key: string;
  subject: string;
  blocks: Record<string, string>;
}): Promise<EmailTemplateResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const def = EMAIL_TEMPLATE_BY_KEY[input.key];
  if (!def) return { ok: false, error: "Unknown template." };

  const subject = input.subject.trim();
  if (!subject) return { ok: false, error: "Subject can't be empty." };
  if (subject.length > MAX_SUBJECT) return { ok: false, error: "Subject is too long." };

  const allowed = editableBlockIds(input.key);
  const blocks: Record<string, string> = {};
  for (const [id, raw] of Object.entries(input.blocks ?? {})) {
    if (!allowed.has(id)) continue; // ignore unknown/custom ids
    const text = raw.trim();
    if (!text) return { ok: false, error: "Blocks can't be empty." };
    if (text.length > MAX_BLOCK) return { ok: false, error: "A block is too long." };
    blocks[id] = text;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("email_templates").upsert(
    {
      key: input.key,
      subject,
      blocks,
      updated_at: new Date().toISOString(),
      updated_by: guard.adminId,
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/emails");
  return { ok: true };
}

/** Delete the override → the sender falls back to the code defaults. */
export async function resetEmailTemplate(key: string): Promise<EmailTemplateResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!EMAIL_TEMPLATE_BY_KEY[key]) return { ok: false, error: "Unknown template." };

  const admin = createAdminClient();
  const { error } = await admin.from("email_templates").delete().eq("key", key);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/emails");
  return { ok: true };
}

/**
 * Switch one email on or off (Task 22). Stored in `notification_toggles`
 * (0053), separate from the override row, so "Reset" never re-enables a
 * template. `renderTemplateEmail` returns an empty render for a switched-off
 * key and `sendEmail` drops it. Security-critical and internal alerts are
 * locked on (lib/notifications/locked.ts).
 */
export async function setEmailTemplateEnabled(
  key: string,
  enabled: boolean,
): Promise<EmailTemplateResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!EMAIL_TEMPLATE_BY_KEY[key]) return { ok: false, error: "Unknown template." };
  if (isEmailTemplateLocked(key))
    return { ok: false, error: "This email can't be switched off." };

  const admin = createAdminClient();
  const { error } = await admin.from("notification_toggles").upsert(
    {
      channel: "email",
      key,
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: guard.adminId,
    },
    { onConflict: "channel,key" },
  );
  if (error) return { ok: false, error: error.message };
  clearNotificationToggleCache();
  revalidatePath("/admin/emails");
  return { ok: true };
}

/** Render a preview of unsaved edits with each variable's example value. */
export async function previewEmailTemplate(input: {
  key: string;
  subject: string;
  blocks: Record<string, string>;
}): Promise<{ ok: true; subject: string; html: string } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!EMAIL_TEMPLATE_BY_KEY[input.key]) return { ok: false, error: "Unknown template." };
  try {
    const { subject, html } = await previewTemplateEmail(input.key, input.subject, input.blocks);
    return { ok: true, subject, html };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Preview failed." };
  }
}
