"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import {
  gsmFriendly,
  interpolateTemplate,
  type SmsAudience,
  type TemplateVariable,
} from "@/lib/sms/templates";
import { saveSmsTemplate, resetSmsTemplate, setSmsTemplateEnabled } from "@/app/actions/sms";

export interface TemplateRow {
  key: string;
  label: string;
  description: string;
  audience: SmsAudience;
  variables: TemplateVariable[];
  defaultBody: string;
  /** Admin override, or null when on the default. */
  override: string | null;
  /** Off = this text never goes out (Task 22). */
  enabled: boolean;
}

const AUDIENCE_LABELS: Record<SmsAudience, string> = {
  customer: "Customer texts",
  mechanic: "Mechanic texts",
};
const AUDIENCE_ORDER: SmsAudience[] = ["customer", "mechanic"];

const CARD = "rounded-2xl border border-border bg-surface-card p-5";
const FIELD_INPUT =
  "w-full rounded-button border border-border bg-surface-card px-3.5 py-2.5 text-sm leading-relaxed text-text-primary outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";

export function TemplatesEditor({ templates }: { templates: TemplateRow[] }) {
  const grouped = useMemo(
    () =>
      AUDIENCE_ORDER.map((audience) => ({
        audience,
        items: templates.filter((t) => t.audience === audience),
      })).filter((g) => g.items.length > 0),
    [templates],
  );

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <section key={group.audience} className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            {AUDIENCE_LABELS[group.audience]}
          </h3>
          <div className="space-y-5">
            {group.items.map((t) => (
              <TemplateCard key={t.key} template={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function previewVars(variables: TemplateVariable[]): Record<string, string> {
  return Object.fromEntries(variables.map((v) => [v.name, v.example]));
}

function TemplateCard({ template }: { template: TemplateRow }) {
  const initial = template.override ?? template.defaultBody;
  const [body, setBody] = useState(initial);
  const [savedOverride, setSavedOverride] = useState<string | null>(template.override);
  const [enabled, setEnabled] = useState(template.enabled);
  const [pending, start] = useTransition();
  const [flipping, startFlip] = useTransition();

  const isOverride = savedOverride != null;
  const dirty = body !== (savedOverride ?? template.defaultBody);
  // What will actually go out: interpolated, then transliterated the way
  // `sendSms` does it (en dashes → hyphens etc.).
  const preview = gsmFriendly(interpolateTemplate(body, previewVars(template.variables)));

  function save() {
    start(async () => {
      const res = await saveSmsTemplate({ key: template.key, body });
      if (res.ok) {
        setSavedOverride(body);
        toast.success(`"${template.label}" saved.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function reset() {
    start(async () => {
      const res = await resetSmsTemplate(template.key);
      if (res.ok) {
        setSavedOverride(null);
        setBody(template.defaultBody);
        toast.success(`"${template.label}" reset to default.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function flip(next: boolean) {
    setEnabled(next); // optimistic
    startFlip(async () => {
      const res = await setSmsTemplateEnabled(template.key, next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
      } else {
        toast.success(next ? `"${template.label}" is on.` : `"${template.label}" is off — it won't send.`);
      }
    });
  }

  function insertToken(name: string) {
    setBody((b) => `${b}{{${name}}}`);
  }

  return (
    <section className={cn(CARD, "space-y-3", !enabled && "opacity-75")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-text-primary">{template.label}</h3>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                isOverride ? "bg-brand-blue/10 text-brand-blue" : "bg-surface text-text-muted",
              )}
            >
              {isOverride ? "Customised" : "Default"}
            </span>
            {!enabled && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Off
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">{template.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] font-semibold text-text-muted">{enabled ? "On" : "Off"}</span>
          <Switch
            size="sm"
            checked={enabled}
            onChange={flip}
            disabled={flipping}
            label={`Send "${template.label}" texts`}
          />
        </div>
      </div>

      <textarea
        className={cn(FIELD_INPUT, "h-24 resize-y")}
        value={body}
        maxLength={1000}
        onChange={(e) => setBody(e.target.value)}
      />

      {template.variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">Insert:</span>
          {template.variables.map((v) => (
            <button
              key={v.name}
              type="button"
              onClick={() => insertToken(v.name)}
              title={v.description}
              className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs text-text-secondary transition hover:border-brand-blue hover:text-brand-blue"
            >
              {`{{${v.name}}}`}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-button bg-surface px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Preview</p>
        <p className="mt-0.5 text-sm text-text-secondary">{preview || "—"}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty || !body.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
        >
          {pending ? <Icon icon={Loader2} size={14} className="animate-spin" /> : <Icon icon={Save} size={14} />}
          Save
        </button>
        {isOverride && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex h-9 items-center gap-2 rounded-button border border-border px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface disabled:opacity-50"
          >
            <Icon icon={RotateCcw} size={14} />
            Reset to default
          </button>
        )}
      </div>
    </section>
  );
}
