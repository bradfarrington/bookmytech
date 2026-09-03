"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Eye, Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import {
  saveEmailTemplate,
  resetEmailTemplate,
  previewEmailTemplate,
  setEmailTemplateEnabled,
} from "@/app/actions/email-templates";

export interface EmailBlockRow {
  id: string;
  type: string;
  defaultText: string;
  override: string | null;
}

export interface EmailTemplateRow {
  key: string;
  label: string;
  description: string;
  category: string;
  subjectDefault: string;
  subjectOverride: string | null;
  variables: { name: string; description: string }[];
  blocks: EmailBlockRow[];
  hasOverride: boolean;
  /** Off = this email never goes out (Task 22). */
  enabled: boolean;
  /** Can't be switched off (password reset, internal alerts). */
  locked: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  customer: "Customer",
  mechanic: "Mechanic",
  dispute: "Disputes",
  internal: "Internal alerts",
};
const CATEGORY_ORDER = ["customer", "mechanic", "dispute", "internal"];

const CARD = "rounded-2xl border border-border bg-surface-card";
const INPUT =
  "w-full rounded-button border border-border bg-surface-card px-3.5 py-2.5 text-sm leading-relaxed text-text-primary outline-none transition focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/15";

const BLOCK_LABEL: Record<string, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  note: "Small note",
  button: "Button label",
};

export function EmailTemplatesEditor({ templates }: { templates: EmailTemplateRow[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, EmailTemplateRow[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      items: map.get(c)!,
    }));
  }, [templates]);

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <section key={group.category} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            {CATEGORY_LABELS[group.category] ?? group.category}
          </h2>
          <div className="space-y-3">
            {group.items.map((t) => (
              <TemplateCard key={t.key} template={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TemplateCard({ template }: { template: EmailTemplateRow }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subjectOverride ?? template.subjectDefault);
  const [blocks, setBlocks] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.blocks.map((b) => [b.id, b.override ?? b.defaultText])),
  );
  const [isOverride, setIsOverride] = useState(template.hasOverride);
  const [enabled, setEnabled] = useState(template.enabled);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [flipping, startFlip] = useTransition();

  function save() {
    start(async () => {
      const res = await saveEmailTemplate({ key: template.key, subject, blocks });
      if (res.ok) {
        setIsOverride(true);
        toast.success(`"${template.label}" saved.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function reset() {
    start(async () => {
      const res = await resetEmailTemplate(template.key);
      if (res.ok) {
        setIsOverride(false);
        setSubject(template.subjectDefault);
        setBlocks(Object.fromEntries(template.blocks.map((b) => [b.id, b.defaultText])));
        setPreviewHtml(null);
        toast.success(`"${template.label}" reset to default.`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function preview() {
    startPreview(async () => {
      const res = await previewEmailTemplate({ key: template.key, subject, blocks });
      if (res.ok) setPreviewHtml(res.html);
      else toast.error(res.error);
    });
  }

  function flip(next: boolean) {
    setEnabled(next); // optimistic
    startFlip(async () => {
      const res = await setEmailTemplateEnabled(template.key, next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
      } else {
        toast.success(next ? `"${template.label}" is on.` : `"${template.label}" is off — it won't send.`);
      }
    });
  }

  return (
    <div className={cn(CARD, !enabled && "opacity-75")}>
      {/* Header: the expand button and the on/off switch are siblings, never
          nested, so a tap on the switch doesn't also open the card. */}
      <div className="flex items-center gap-3 p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary">{template.label}</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  isOverride ? "bg-brand-blue/10 text-brand-blue" : "bg-surface text-text-muted",
                )}
              >
                {isOverride ? "Customised" : "Default"}
              </span>
              {!enabled && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Off
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-muted">{template.description}</p>
          </div>
          <Icon
            icon={ChevronDown}
            size={18}
            className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          />
        </button>
        {template.locked ? (
          <span
            className="shrink-0 text-[11px] font-semibold text-text-muted"
            title="This email can't be switched off"
          >
            Always on
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-semibold text-text-muted">{enabled ? "On" : "Off"}</span>
            <Switch
              size="sm"
              checked={enabled}
              onChange={flip}
              disabled={flipping}
              label={`Send "${template.label}" emails`}
            />
          </div>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-border-subtle p-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-text-primary">Subject</span>
            <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>

          {template.blocks.map((b) => (
            <label key={b.id} className="block space-y-1.5">
              <span className="text-xs font-semibold text-text-primary">
                {BLOCK_LABEL[b.type] ?? b.type}
              </span>
              <textarea
                className={cn(INPUT, b.type === "note" || b.type === "button" ? "h-16" : "h-20", "resize-y")}
                value={blocks[b.id] ?? ""}
                onChange={(e) => setBlocks((prev) => ({ ...prev, [b.id]: e.target.value }))}
              />
            </label>
          ))}

          {template.variables.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-text-muted">Merge tags:</span>
              {template.variables.map((v) => (
                <span
                  key={v.name}
                  title={v.description}
                  className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs text-text-secondary"
                >
                  {`{{${v.name}}}`}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {pending ? <Icon icon={Loader2} size={14} className="animate-spin" /> : <Icon icon={Save} size={14} />}
              Save
            </button>
            <button
              type="button"
              onClick={preview}
              disabled={previewing}
              className="inline-flex h-9 items-center gap-2 rounded-button border border-border px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface disabled:opacity-50"
            >
              {previewing ? <Icon icon={Loader2} size={14} className="animate-spin" /> : <Icon icon={Eye} size={14} />}
              Preview
            </button>
            {isOverride && (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-button border border-border px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface disabled:opacity-50"
              >
                <Icon icon={RotateCcw} size={14} />
                Reset
              </button>
            )}
          </div>

          {previewHtml && (
            <div className="overflow-hidden rounded-xl border border-border">
              <iframe
                title={`${template.label} preview`}
                srcDoc={previewHtml}
                className="h-[520px] w-full bg-white"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
