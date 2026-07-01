"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { interpolateTemplate, type TemplateVariable } from "@/lib/sms/templates";
import { saveSmsTemplate, resetSmsTemplate } from "@/app/actions/sms";

export interface TemplateRow {
  key: string;
  label: string;
  description: string;
  variables: TemplateVariable[];
  defaultBody: string;
  /** Admin override, or null when on the default. */
  override: string | null;
}

const CARD = "rounded-2xl border border-border bg-surface-card p-5";
const FIELD_INPUT =
  "w-full rounded-button border border-border bg-surface-card px-3.5 py-2.5 text-sm leading-relaxed text-text-primary outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";

export function TemplatesEditor({ templates }: { templates: TemplateRow[] }) {
  return (
    <div className="space-y-5">
      {templates.map((t) => (
        <TemplateCard key={t.key} template={t} />
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
  const [isOverride, setIsOverride] = useState(template.override != null);
  const [pending, start] = useTransition();

  const dirty = body !== (isOverride ? template.override ?? "" : template.defaultBody);
  const preview = interpolateTemplate(body, previewVars(template.variables));

  function save() {
    start(async () => {
      const res = await saveSmsTemplate({ key: template.key, body });
      if (res.ok) {
        setIsOverride(true);
        template.override = body; // keep dirty check honest without a refresh
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
        setIsOverride(false);
        template.override = null;
        setBody(template.defaultBody);
        toast.success(`"${template.label}" reset to default.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function insertToken(name: string) {
    setBody((b) => `${b}{{${name}}}`);
  }

  return (
    <section className={cn(CARD, "space-y-3")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{template.label}</h3>
          <p className="text-xs text-text-muted">{template.description}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            isOverride ? "bg-brand-blue/10 text-brand-blue" : "bg-surface text-text-muted",
          )}
        >
          {isOverride ? "Customised" : "Default"}
        </span>
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
