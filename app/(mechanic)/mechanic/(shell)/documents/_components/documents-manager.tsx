"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  ACCEPTED_DOC_ACCEPT,
  MECHANIC_DOC_DEFS,
  MECHANIC_DOC_LABEL,
  type MechanicDocType,
} from "@/lib/onboarding/docs";
import { daysUntil, expiryState } from "@/lib/onboarding/expiry";
import { getMechanicDocumentUrl, uploadMechanicDocument } from "@/app/actions/documents";

export interface DocItem {
  id: string;
  docType: MechanicDocType;
  status: "pending_review" | "verified" | "rejected" | "expired";
  expiresAt: string | null;
  uploadedAt: string;
}

const TYPE_OPTIONS = MECHANIC_DOC_DEFS.map((d) => ({ value: d.type, label: d.label }));

const STATUS_META: Record<DocItem["status"], { label: string; className: string; Icon: typeof Clock }> = {
  pending_review: { label: "Pending review", className: "text-warning", Icon: Clock },
  verified: { label: "Verified", className: "text-success", Icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "text-danger", Icon: XCircle },
  expired: { label: "Expired", className: "text-danger", Icon: AlertTriangle },
};

function expiryLabel(item: DocItem): { text: string; tone: string } | null {
  if (!item.expiresAt) return null;
  const state = expiryState(item.expiresAt);
  const d = daysUntil(item.expiresAt);
  const date = new Date(item.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (state === "expired") return { text: `Expired ${date}`, tone: "text-danger" };
  if (state === "expiring_soon")
    return { text: `Expires ${date} (${d}d)`, tone: "text-warning" };
  return { text: `Expires ${date}`, tone: "text-text-muted" };
}

export function DocumentsManager({ documents }: { documents: DocItem[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState<MechanicDocType>("public_liability_insurance");
  const [expiresAt, setExpiresAt] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const expectsExpiry = MECHANIC_DOC_DEFS.find((d) => d.type === docType)?.expires;

  function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a file to upload.");
      return;
    }
    const fd = new FormData();
    fd.set("doc_type", docType);
    fd.set("file", file);
    if (expiresAt) fd.set("expires_at", expiresAt);
    startTransition(async () => {
      const result = await uploadMechanicDocument(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Document uploaded — it's now pending review.");
      setExpiresAt("");
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  async function view(id: string) {
    setOpening(id);
    const result = await getMechanicDocumentUrl(id);
    setOpening(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
  }

  const hasWarnings = documents.some(
    (d) => d.status === "expired" || (d.status === "verified" && expiryState(d.expiresAt) === "expiring_soon"),
  );

  return (
    <div className="space-y-6">
      {hasWarnings && (
        <div className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            You have documents that are expired or expiring soon. Upload current
            copies below to keep receiving jobs.
          </p>
        </div>
      )}

      {/* Upload */}
      <Card className="space-y-4">
        <h2 className="text-sm font-bold text-text-primary">Upload a document</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
            <span>Document type</span>
            <Select
              value={docType}
              onChange={(v) => setDocType(v as MechanicDocType)}
              options={TYPE_OPTIONS}
              aria-label="Document type"
            />
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
            <span>
              Expiry date{" "}
              <span className="font-normal text-text-muted">
                {expectsExpiry ? "" : "(if applicable)"}
              </span>
            </span>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-11 rounded-button border border-border bg-surface-card px-3.5 text-sm text-text-primary focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-button border border-border px-3.5 py-2 text-sm font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue"
          >
            <Upload className="size-4" />
            {fileName ?? "Choose file"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_DOC_ACCEPT}
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <Button variant="primary" disabled={pending} onClick={submit}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </Card>

      {/* On file */}
      <Card className="space-y-1">
        <h2 className="mb-2 text-sm font-bold text-text-primary">Documents on file</h2>
        {documents.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No documents on file yet. Upload your insurance and qualifications above.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {documents.map((doc) => {
              const meta = STATUS_META[doc.status];
              const exp = expiryLabel(doc);
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {MECHANIC_DOC_LABEL[doc.docType]}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs">
                      <span className={cn("inline-flex items-center gap-1 font-medium", meta.className)}>
                        <meta.Icon className="size-3.5" />
                        {meta.label}
                      </span>
                      {exp && (
                        <span className={cn("inline-flex items-center gap-1", exp.tone)}>
                          <CalendarClock className="size-3.5" />
                          {exp.text}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => view(doc.id)}
                    disabled={opening === doc.id}
                    className="inline-flex shrink-0 items-center gap-1 rounded-button border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary hover:border-brand-blue hover:text-brand-blue disabled:opacity-50"
                  >
                    {opening === doc.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="size-3.5" />
                    )}
                    View
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
