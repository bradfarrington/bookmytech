import { createAdminClient } from "@/lib/supabase/admin";
import { SMS_TEMPLATE_DEFS } from "@/lib/sms/templates";
import { TemplatesEditor, type TemplateRow } from "../_components/templates-editor";

export const dynamic = "force-dynamic";

export default async function SmsTemplatesPage() {
  const admin = createAdminClient();
  const { data: overrides } = await admin.from("sms_templates").select("key, body");
  const overrideByKey = new Map((overrides ?? []).map((o) => [o.key, o.body as string]));

  const templates: TemplateRow[] = SMS_TEMPLATE_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    variables: def.variables,
    defaultBody: def.defaultBody,
    override: overrideByKey.get(def.key) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">Message templates</h2>
        <p className="max-w-2xl text-sm text-text-muted">
          Customise the SMS copy sent at each point in a booking&apos;s life. Use{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-xs">{"{{token}}"}</code>{" "}
          merge tags — they&apos;re filled in automatically. Leave a template on
          its default, or reset any time.
        </p>
      </div>
      <TemplatesEditor templates={templates} />
    </div>
  );
}
