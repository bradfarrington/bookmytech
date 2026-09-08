"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Ban, CheckCircle2, Navigation, Wrench, BadgePoundSterling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cancelOwnJob, proposeReschedule } from "@/app/actions/mechanic-jobs";
import { startJourney, beginWork, completeAndCharge } from "@/app/actions/job-progress";
import { formatPrice } from "@/lib/utils";

interface JobActionsProps {
  bookingId: string;
  status: string;
  scheduledAt: string | null;
  rescheduleStatus: string | null;
  rescheduleProposedAt: string | null;
  /** What completing will take off the customer's card, for the confirm step. */
  chargePence: number;
}

const CANCEL_REASONS = [
  { value: "", label: "Select a reason…" },
  { value: "Vehicle or parts issue", label: "Vehicle / parts issue" },
  { value: "Scheduling clash", label: "Scheduling clash / double-booked" },
  { value: "Unwell", label: "Unwell / unavailable" },
  { value: "Customer unreachable", label: "Customer unreachable" },
  { value: "Outside my area", label: "Too far / outside my area" },
  { value: "Other", label: "Other" },
];

// Pre-fill the reschedule picker with the current slot in the format a
// datetime-local input expects (local time, no timezone suffix).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JobActions({
  bookingId,
  status,
  scheduledAt,
  rescheduleStatus,
  rescheduleProposedAt,
  chargePence,
}: JobActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const [reason, setReason] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");
  const [newTime, setNewTime] = useState(() => toLocalInput(scheduledAt));
  const [note, setNote] = useState("");

  // Live job lifecycle. Each transition fires its server action and refreshes;
  // the customer's tracker reads the same status. (GPS live-location tracking
  // is still the mobile app's job — this is the status flag only.)
  function runLive(
    action: (id: string) => Promise<{ ok: boolean; error?: string }>,
    success: string,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const res = await action(bookingId);
      if (res.ok) {
        toast.success(success);
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
    });
  }

  if (status === "en_route") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-brand-blue/20 bg-blue-50 px-3.5 py-3 text-sm text-blue-700">
          <Navigation size={16} className="mt-0.5 shrink-0 text-brand-blue" />
          You&apos;re marked as <strong>on the way</strong>. The customer can see
          this on their tracker.
        </div>
        <Button
          size="sm"
          fullWidth
          iconLeft={Wrench}
          disabled={pending}
          onClick={() => runLive(beginWork, "Job started — the customer's been updated.")}
        >
          I&apos;ve arrived — begin work
        </Button>
      </div>
    );
  }

  if (status === "in_progress") {
    // Completing captures the customer's pre-authorisation, so it asks once
    // before it does. (There is no customer signature: the mechanic's own
    // confirmation is the record, and it goes into the completion event.)
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-700">
          <Wrench size={16} className="mt-0.5 shrink-0 text-amber-600" />
          Work is <strong>in progress</strong>. When you&apos;re finished, confirm below — that
          completes the job and captures payment.
        </div>

        {confirming ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface px-3.5 py-3">
            <p className="text-sm text-text-primary">
              Charge <strong>{formatPrice(chargePence)}</strong> to the customer&apos;s card and mark
              this job complete?
            </p>
            <p className="text-xs text-text-muted">
              Check the work is finished and you&apos;ve added any photos — this can&apos;t be undone
              from here.
            </p>
            <Button
              size="sm"
              fullWidth
              iconLeft={BadgePoundSterling}
              disabled={pending}
              onClick={() =>
                runLive(completeAndCharge, "Job complete — payment captured.", () =>
                  setConfirming(false),
                )
              }
            >
              Confirm &amp; charge {formatPrice(chargePence)}
            </Button>
            <Button variant="ghost" size="sm" fullWidth disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <Button
              size="sm"
              fullWidth
              iconLeft={BadgePoundSterling}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Complete job &amp; charge customer
            </Button>
            <p className="text-xs text-text-muted">
              Completing captures the pre-authorised amount. You&apos;re paid out 24h after that.
            </p>
          </>
        )}
      </div>
    );
  }

  if (status === "completed") {
    return (
      <p className="flex items-start gap-2 text-sm text-text-muted">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
        This job is complete. Your earnings are reflected in the breakdown.
      </p>
    );
  }

  if (status === "cancelled" || status === "disputed") {
    return (
      <p className="text-sm text-text-muted">
        No further actions are available on this job.
      </p>
    );
  }

  // status === "confirmed" (the only actionable desktop state).
  function handleReschedule() {
    if (!newTime) {
      toast.error("Pick a new date and time.");
      return;
    }
    // datetime-local has no timezone — treat the entered value as local time.
    const iso = new Date(newTime).toISOString();
    startTransition(async () => {
      const res = await proposeReschedule(bookingId, iso, note);
      if (res.ok) {
        toast.success("New time proposed — the customer has been notified.");
        setNote("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleCancel() {
    if (!reason) {
      toast.error("Choose a reason for cancelling.");
      return;
    }
    const full = reasonDetails.trim() ? `${reason} — ${reasonDetails.trim()}` : reason;
    startTransition(async () => {
      const res = await cancelOwnJob(bookingId, full);
      if (res.ok) {
        toast.success("Job cancelled — we're sourcing a replacement.");
        router.push("/mechanic/jobs");
      } else {
        toast.error(res.error);
      }
    });
  }

  const pendingProposal = rescheduleStatus === "proposed" && rescheduleProposedAt;

  return (
    <div className="space-y-5">
      {/* Start the live job. Hidden while a reschedule is awaiting the customer
          so the slot isn't started under a contested time. */}
      {!pendingProposal && (
        <div>
          <Button
            size="sm"
            fullWidth
            iconLeft={Navigation}
            disabled={pending}
            onClick={() => runLive(startJourney, "You're on the way — the customer's been notified.")}
          >
            Start journey
          </Button>
          <p className="mt-1.5 text-xs text-text-muted">
            Marks you as on the way and shows the customer your live status.
          </p>
        </div>
      )}

      {pendingProposal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs font-semibold text-amber-800">
            Reschedule proposed — awaiting customer
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            You proposed{" "}
            {new Date(rescheduleProposedAt as string).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . The job keeps its original slot until the customer responds.
          </p>
        </div>
      )}

      {/* Reschedule */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          <CalendarClock size={12} />
          Propose a new time
        </div>
        <input
          type="datetime-local"
          value={newTime}
          onChange={(e) => setNewTime(e.target.value)}
          className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-brand-blue focus:outline-none"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note for the customer"
          className="mt-2 w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={pending || !newTime}
          onClick={handleReschedule}
        >
          Propose new time
        </Button>
        <p className="mt-1.5 text-xs text-text-muted">
          The customer is notified and can accept, suggest another time, or keep
          the original slot.
        </p>
      </div>

      {/* Cancel */}
      <div className="border-t border-border-subtle pt-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-red-600">
          <Ban size={12} />
          Cancel this job
        </div>
        <Select<string>
          value={reason}
          onChange={setReason}
          options={CANCEL_REASONS}
          aria-label="Cancellation reason"
          className="w-full"
        />
        <textarea
          value={reasonDetails}
          onChange={(e) => setReasonDetails(e.target.value)}
          rows={2}
          placeholder="Add any detail (optional)"
          className="mt-2 w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-red-400 focus:outline-none"
        />
        <button
          disabled={pending || !reason}
          onClick={handleCancel}
          className="mt-2 inline-flex h-9 items-center rounded-button bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel job
        </button>
        <p className="mt-1.5 text-xs text-text-muted">
          The job is re-offered to other mechanics. The customer&apos;s payment
          stays held (not charged) and transfers to the replacement.
        </p>
      </div>
    </div>
  );
}
