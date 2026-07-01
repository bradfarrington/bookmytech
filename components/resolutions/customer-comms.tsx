"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import { sendCaseCustomerEmail, sendCaseCustomerSms } from "@/app/actions/resolutions";

export interface TemplateOption {
  value: string; // template key
  label: string;
}

const MANUAL = "__manual__";
const FIELD =
  "w-full rounded-button border border-border bg-surface-card px-3.5 py-2.5 text-sm text-text-primary outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20";

// Admin-only panel — the ONLY customer touch-point in the Resolution Center.
// Email + SMS are each independently optional: pick a template OR write a manual
// message. The case itself is never visible to the customer.
export function CustomerComms({
  caseId,
  emailTemplates,
  smsTemplates,
  hasEmail,
  hasPhone,
}: {
  caseId: string;
  emailTemplates: TemplateOption[];
  smsTemplates: TemplateOption[];
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EmailPanel caseId={caseId} templates={emailTemplates} disabled={!hasEmail} />
      <SmsPanel caseId={caseId} templates={smsTemplates} disabled={!hasPhone} />
    </div>
  );
}

function EmailPanel({
  caseId,
  templates,
  disabled,
}: {
  caseId: string;
  templates: TemplateOption[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(templates[0]?.value ?? MANUAL);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const manual = choice === MANUAL;

  const options: TemplateOption[] = [...templates, { value: MANUAL, label: "Write manually…" }];

  function send() {
    start(async () => {
      const res = await sendCaseCustomerEmail(
        manual
          ? { caseId, manualSubject: subject, manualBody: body }
          : { caseId, templateKey: choice },
      );
      if (res.ok) {
        toast.success("Email sent to the customer.");
        setSubject("");
        setBody("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-card p-5">
      <div className="flex items-center gap-2">
        <Mail size={15} className="text-brand-blue" />
        <h3 className="text-sm font-bold text-text-primary">Email the customer</h3>
      </div>
      {disabled ? (
        <p className="text-xs text-text-muted">This booking has no customer email on file.</p>
      ) : (
        <>
          <Select<string> value={choice} onChange={setChoice} options={options} aria-label="Email template" />
          {manual && (
            <>
              <input
                className={FIELD}
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <textarea
                className={`${FIELD} h-28 resize-y`}
                placeholder="Message…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </>
          )}
          <button
            type="button"
            onClick={send}
            disabled={pending || (manual && (!subject.trim() || !body.trim()))}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Send email
          </button>
        </>
      )}
    </section>
  );
}

function SmsPanel({
  caseId,
  templates,
  disabled,
}: {
  caseId: string;
  templates: TemplateOption[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(templates[0]?.value ?? MANUAL);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const manual = choice === MANUAL;

  const options: TemplateOption[] = [...templates, { value: MANUAL, label: "Write manually…" }];

  function send() {
    start(async () => {
      const res = await sendCaseCustomerSms(
        manual ? { caseId, manualBody: body } : { caseId, templateKey: choice },
      );
      if (res.ok) {
        toast.success("SMS sent to the customer.");
        setBody("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-card p-5">
      <div className="flex items-center gap-2">
        <MessageSquare size={15} className="text-brand-blue" />
        <h3 className="text-sm font-bold text-text-primary">Text the customer</h3>
      </div>
      {disabled ? (
        <p className="text-xs text-text-muted">This booking has no customer phone on file.</p>
      ) : (
        <>
          <Select<string> value={choice} onChange={setChoice} options={options} aria-label="SMS template" />
          {manual && (
            <textarea
              className={`${FIELD} h-24 resize-y`}
              placeholder="Message…"
              maxLength={1000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
          <button
            type="button"
            onClick={send}
            disabled={pending || (manual && !body.trim())}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            Send SMS
          </button>
        </>
      )}
    </section>
  );
}
