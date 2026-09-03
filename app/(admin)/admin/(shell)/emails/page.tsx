import { createAdminClient } from "@/lib/supabase/admin";
import { Overline } from "@/components/ui/overline";
import { EMAIL_TEMPLATE_DEFS } from "@/emails/registry";
import { isEditableBlock } from "@/emails/blocks";
import { isEmailTemplateLocked } from "@/lib/notifications/locked";
import { fetchDisabledKeys } from "@/lib/notifications/toggles";
import {
  EmailTemplatesEditor,
  type EmailTemplateRow,
} from "./_components/email-templates-editor";

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage() {
  const admin = createAdminClient();
  const [{ data: overrides }, disabled] = await Promise.all([
    admin.from("email_templates").select("key, subject, blocks"),
    fetchDisabledKeys("email"),
  ]);
  const byKey = new Map((overrides ?? []).map((o) => [o.key, o]));

  const templates: EmailTemplateRow[] = EMAIL_TEMPLATE_DEFS.map((def) => {
    const ov = byKey.get(def.key);
    const blockOverrides = (ov?.blocks as Record<string, string> | undefined) ?? {};
    const locked = isEmailTemplateLocked(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      category: def.category,
      subjectDefault: def.subject,
      subjectOverride: (ov?.subject as string | null) ?? null,
      variables: def.variables.map((v) => ({ name: v.name, description: v.description })),
      blocks: def.blocks.filter(isEditableBlock).map((b) => ({
        id: b.id,
        type: b.type,
        defaultText: b.text,
        override: blockOverrides[b.id] ?? null,
      })),
      hasOverride: !!ov,
      // A locked template is always on, whatever the table says.
      enabled: locked || !disabled.has(def.key),
      locked,
    };
  });

  return (
    <div className="space-y-8">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Email templates</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Customise the subject and copy of every email the platform sends. Use{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-xs">{"{{token}}"}</code>{" "}
          merge tags, <code className="rounded bg-surface px-1 py-0.5 text-xs">**bold**</code>{" "}
          and <code className="rounded bg-surface px-1 py-0.5 text-xs">[links](url)</code>. Layout
          and branding stay fixed. Preview any change before saving, and reset to the default
          any time. Each email has a switch to stop it going out; password resets and internal
          alerts stay on.
        </p>
      </header>
      <EmailTemplatesEditor templates={templates} />
    </div>
  );
}
