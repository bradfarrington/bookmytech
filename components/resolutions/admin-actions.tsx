"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Select } from "@/components/ui/select";
import { redistributeFromCase, updateResolutionStatus } from "@/app/actions/resolutions";
import {
  ADMIN_RESOLVABLE_STATUSES,
  RESOLUTION_STATUS_LABELS,
  type ResolutionStatus,
} from "@/lib/resolutions/constants";

// Admin case controls: re-broadcast the job to other mechanics, and move the
// case through its status lifecycle.
export function AdminCaseActions({
  caseId,
  status,
  redistributed,
  canRedistribute,
}: {
  caseId: string;
  status: ResolutionStatus;
  redistributed: boolean;
  canRedistribute: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [status2, setStatus] = useState<ResolutionStatus>(status);
  const [pending, start] = useTransition();

  function redistribute() {
    start(async () => {
      const res = await redistributeFromCase(caseId, note);
      if (res.ok) {
        toast.success("Job re-broadcast to other mechanics.");
        setNote("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function saveStatus() {
    start(async () => {
      const res = await updateResolutionStatus(caseId, status2, note);
      if (res.ok) {
        toast.success("Case updated.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-card p-5">
      <h3 className="text-sm font-bold text-text-primary">Actions</h3>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-text-muted">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Internal note attached to the action…"
          className="resize-none rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={redistribute}
          disabled={pending || redistributed || !canRedistribute}
          title={
            redistributed
              ? "Already redistributed"
              : !canRedistribute
                ? "This job can't be redistributed"
                : undefined
          }
          className="inline-flex h-9 items-center gap-2 rounded-button border border-brand-blue bg-surface-card px-4 text-sm font-semibold text-brand-blue transition hover:bg-blue-50 disabled:opacity-50"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {redistributed ? "Redistributed" : "Redistribute job"}
        </button>

        <div className="flex items-center gap-2">
          <Select<ResolutionStatus>
            value={status2}
            onChange={setStatus}
            options={ADMIN_RESOLVABLE_STATUSES.map((s) => ({
              value: s,
              label: RESOLUTION_STATUS_LABELS[s],
            }))}
            aria-label="Case status"
            className="w-44"
          />
          <button
            type="button"
            onClick={saveStatus}
            disabled={pending || status2 === status}
            className="inline-flex h-9 items-center rounded-button bg-text-primary px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            Update status
          </button>
        </div>
      </div>
    </div>
  );
}
