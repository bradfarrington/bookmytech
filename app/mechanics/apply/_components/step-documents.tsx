"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, FileUp, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_DOC_ACCEPT,
  DOC_DEFS,
  type DocType,
} from "@/lib/onboarding/docs";
import { uploadApplicationDoc } from "@/app/actions/submit-application";
import { useApplication, type ReferenceData } from "./application-provider";
import { StepShell } from "./step-shell";
import { FIELD_INPUT, FIELD_LABEL, FIELD_HINT } from "./field";

const SORT_CODE_RE = /^\d{6}$/;
const ACCOUNT_RE = /^\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function DocUpload({ docType, label, hint }: { docType: DocType; label: string; hint: string }) {
  const { data, update } = useApplication();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploaded = data.docs[docType];

  async function onPick(file: File) {
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadApplicationDoc(data.draftId, docType, fd);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    update({ docs: { ...data.docs, [docType]: { path: result.path, fileName: result.fileName } } });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-card p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{label}</p>
          <p className={FIELD_HINT}>{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-button border px-3 py-1.5 text-xs font-semibold",
            uploaded
              ? "border-success/40 bg-success/10 text-success"
              : "border-border text-text-secondary hover:border-brand-blue hover:text-brand-blue",
          )}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : uploaded ? (
            <Check className="size-3.5" />
          ) : (
            <FileUp className="size-3.5" />
          )}
          {uploading ? "Uploading…" : uploaded ? "Replace" : "Upload"}
        </button>
      </div>

      {uploaded && (
        <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
          <span className="truncate">{uploaded.fileName}</span>
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => {
              const next = { ...data.docs };
              delete next[docType];
              update({ docs: next });
            }}
            className="text-text-muted hover:text-danger"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOC_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ReferenceFields({
  index,
  value,
  onChange,
}: {
  index: number;
  value: ReferenceData;
  onChange: (patch: Partial<ReferenceData>) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">
        Reference {index + 1}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Full name"
          className={FIELD_INPUT}
          aria-label={`Reference ${index + 1} name`}
        />
        <input
          type="text"
          value={value.relationship}
          onChange={(e) => onChange({ relationship: e.target.value })}
          placeholder="Relationship (e.g. former employer)"
          className={FIELD_INPUT}
          aria-label={`Reference ${index + 1} relationship`}
        />
        <input
          type="email"
          value={value.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="Email"
          className={FIELD_INPUT}
          aria-label={`Reference ${index + 1} email`}
        />
        <input
          type="tel"
          value={value.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="Phone"
          className={FIELD_INPUT}
          aria-label={`Reference ${index + 1} phone`}
        />
      </div>
    </fieldset>
  );
}

export function StepDocuments() {
  const router = useRouter();
  const { data, update, bank, setBank } = useApplication();
  const [error, setError] = useState<string | null>(null);

  const docDefs = DOC_DEFS.filter((d) => !d.conditional || data.vatRegistered);

  function setReference(i: number, patch: Partial<ReferenceData>) {
    const refs = [...data.references] as typeof data.references;
    refs[i] = { ...refs[i], ...patch };
    update({ references: refs });
  }

  function handleNext() {
    for (const def of docDefs) {
      if (!data.docs[def.type]) return setError(`Please upload: ${def.label}.`);
    }
    if (!SORT_CODE_RE.test(bank.sortCode.replace(/[\s-]/g, "")))
      return setError("Sort code must be 6 digits.");
    if (!ACCOUNT_RE.test(bank.accountNumber.replace(/\s/g, "")))
      return setError("Account number must be 8 digits.");
    for (const [i, ref] of data.references.entries()) {
      if (!ref.name.trim() || !ref.email.trim() || !ref.phone.trim())
        return setError(`Reference ${i + 1} needs a name, email and phone.`);
      if (!EMAIL_RE.test(ref.email.trim()))
        return setError(`Reference ${i + 1} email looks invalid.`);
    }
    setError(null);
    router.push("/mechanics/apply/review");
  }

  return (
    <StepShell
      title="Documents & references"
      intro="Upload your paperwork and add two professional references. Files are stored securely and only seen by our verification team."
      backHref="/mechanics/apply/step-3"
      error={error}
      onNext={handleNext}
    >
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">Documents</p>
        {docDefs.map((def) => (
          <DocUpload key={def.type} docType={def.type} label={def.label} hint={def.hint} />
        ))}
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div>
          <p className="text-sm font-semibold text-text-primary">Bank account</p>
          <p className={FIELD_HINT}>
            For job payouts. Encrypted at rest — never stored in plain text.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={FIELD_LABEL}>
            <span>Sort code</span>
            <input
              type="text"
              inputMode="numeric"
              value={bank.sortCode}
              onChange={(e) => setBank({ sortCode: e.target.value })}
              placeholder="123456"
              maxLength={8}
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            <span>Account number</span>
            <input
              type="text"
              inputMode="numeric"
              value={bank.accountNumber}
              onChange={(e) => setBank({ accountNumber: e.target.value })}
              placeholder="12345678"
              maxLength={8}
              className={FIELD_INPUT}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div>
          <p className="text-sm font-semibold text-text-primary">Professional references</p>
          <p className={FIELD_HINT}>Two people who can vouch for your work.</p>
        </div>
        {data.references.map((ref, i) => (
          <ReferenceFields
            key={i}
            index={i}
            value={ref}
            onChange={(patch) => setReference(i, patch)}
          />
        ))}
      </div>
    </StepShell>
  );
}
