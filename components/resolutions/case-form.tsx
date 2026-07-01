"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { openResolutionCase } from "@/app/actions/resolutions";
import { MIN_DESCRIPTION_CHARS } from "@/lib/resolutions/constants";

export interface CaseJobOption {
  value: string; // booking id
  label: string; // "#A1B2C3D4 · Full service · Mon 3 Aug"
}
export interface CaseReasonOption {
  value: string; // reason id
  label: string;
}

// "Raise a case" form for the Resolution Center. Job dropdown lists the
// mechanic's assigned jobs; reason dropdown lists the admin-configured reasons.
// On success it routes to the party's case detail page.
export function CaseForm({
  jobs,
  reasons,
  redirectBase,
}: {
  jobs: CaseJobOption[];
  reasons: CaseReasonOption[];
  /** e.g. "/mechanic/resolutions" or "/admin/resolutions". */
  redirectBase: string;
}) {
  const router = useRouter();
  const [bookingId, setBookingId] = useState<string>(jobs[0]?.value ?? "");
  const [reasonId, setReasonId] = useState<string>(reasons[0]?.value ?? "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const noJobs = jobs.length === 0;
  const noReasons = reasons.length === 0;

  function submit() {
    setError(null);
    if (!bookingId) {
      setError("Choose the job this relates to.");
      return;
    }
    if (!reasonId) {
      setError("Choose a reason.");
      return;
    }
    if (description.trim().length < MIN_DESCRIPTION_CHARS) {
      setError(`Please add at least ${MIN_DESCRIPTION_CHARS} characters describing the issue.`);
      return;
    }
    startTransition(async () => {
      const res = await openResolutionCase({ bookingId, reasonId, description: description.trim() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`${redirectBase}/${res.caseId}`);
    });
  }

  if (noJobs) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-text-secondary">
        You have no assigned jobs to raise a case against yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-text-primary">Job</label>
        <Select<string>
          value={bookingId}
          onChange={setBookingId}
          options={jobs}
          placeholder="Choose a job…"
          aria-label="Job"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-text-primary">Reason</label>
        {noReasons ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No reasons are configured yet. An admin needs to add some first.
          </p>
        ) : (
          <Select<string>
            value={reasonId}
            onChange={setReasonId}
            options={reasons}
            placeholder="Choose a reason…"
            aria-label="Reason"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold text-text-primary">What&apos;s the issue?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Describe the issue in as much detail as you can…"
          className="rounded-lg border border-border bg-surface-card px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/25 resize-none"
        />
        <span
          className={`text-xs ${
            description.trim().length < MIN_DESCRIPTION_CHARS ? "text-text-muted" : "text-success"
          }`}
        >
          {description.trim().length}/{MIN_DESCRIPTION_CHARS} characters minimum
        </span>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

      <Button
        variant="primary"
        size="lg"
        onClick={submit}
        disabled={pending || noReasons}
        iconLeft={pending ? Loader2 : undefined}
        className="self-start"
      >
        {pending ? "Submitting…" : "Raise case"}
      </Button>
    </div>
  );
}
