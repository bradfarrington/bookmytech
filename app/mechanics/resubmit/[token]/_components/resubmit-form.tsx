"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ACCEPTED_DOC_ACCEPT, DOC_DEFS, type DocType } from "@/lib/onboarding/docs";
import { resubmitDoc, markResubmitted } from "@/app/actions/resubmit";

function DocRow({ token, docType, label, hint }: { token: string; docType: DocType; label: string; hint: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  async function onPick(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await resubmitDoc(token, docType, fd);
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDone(true);
    toast.success(`${label} re-uploaded.`);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-button border px-3 py-1.5 text-xs font-semibold",
          done
            ? "border-success/40 bg-success/10 text-success"
            : "border-border text-text-secondary hover:border-brand-blue hover:text-brand-blue",
        )}
      >
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : done ? <Check className="size-3.5" /> : <FileUp className="size-3.5" />}
        {uploading ? "Uploading…" : done ? "Re-uploaded" : "Re-upload"}
      </button>
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

export function ResubmitForm({ token, vatRegistered }: { token: string; vatRegistered: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const docs = DOC_DEFS.filter((d) => !d.conditional || vatRegistered);

  function handleResubmit() {
    startTransition(async () => {
      const result = await markResubmitted(token);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push("/mechanics/apply/submitted");
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <p className="text-sm font-semibold text-text-primary">Re-upload documents</p>
        <p className="text-xs text-text-muted">
          Only replace the ones we asked about — the rest stay as they were.
        </p>
        {docs.map((d) => (
          <DocRow key={d.type} token={token} docType={d.type} label={d.label} hint={d.hint} />
        ))}
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" disabled={pending} onClick={handleResubmit}>
          {pending ? "Submitting…" : "Resubmit application"}
        </Button>
      </div>
    </div>
  );
}
