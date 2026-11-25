"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Ban, CheckCircle2, Navigation, Wrench, BadgePoundSterling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cancelOwnJob } from "@/app/actions/mechanic-jobs";
import { CANCEL_REASONS as CANCEL_REASON_OPTIONS, joinCancelReason } from "@/lib/mechanics/cancel-reasons";
import { startJourney, beginWork, completeAndCharge } from "@/app/actions/job-progress";
import { formatPrice } from "@/lib/utils";
import { ProposeTimeForm } from "./propose-time-form";

interface JobActionsProps {
  bookingId: string;
  status: string;
  scheduledAt: string | null;
  rescheduleStatus: string | null;
  rescheduleProposedAt: string | null;
  /**
   * Who made the open proposal (0092). "customer": their request, which the
   * card above the page answers. "mechanic" or null (before 0092): this
   * mechanic's own, waiting on the customer.
   */
  rescheduleProposedBy: string | null;
  /** What completing will take off the customer's card, for the confirm step. */
  chargePence: number;
}

const CANCEL_REASONS = [{ value: "", label: "Select a reason…" }, ...CANCEL_REASON_OPTIONS];

export function JobActions({
  bookingId,
  status,
  scheduledAt,
  rescheduleStatus,
  rescheduleProposedAt,
  rescheduleProposedBy,
  chargePence,
}: JobActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const [reason, setReason] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");

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
          onClick={() => runLive(beginWork, "Job started. The customer's been updated.")}
        >
          I&apos;ve arrived, begin work
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
          Work is <strong>in progress</strong>. When you&apos;re finished, confirm below. That
          completes the job and captures payment.
        </div>

        {confirming ? (
          <div className="space-y-2 rounded-xl border border-border bg-surface px-3.5 py-3">
            <p className="text-sm text-text-primary">
              Charge <strong>{formatPrice(chargePence)}</strong> to the customer&apos;s card and mark
              this job complete?
            </p>
            <p className="text-xs text-text-muted">
              Check the work is finished and you&apos;ve added any photos. This can&apos;t be undone
              from here.
            </p>
            <Button
              size="sm"
              fullWidth
              iconLeft={BadgePoundSterling}
              disabled={pending}
              onClick={() =>
                runLive(completeAndCharge, "Job complete. Payment captured.", () =>
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
  function handleCancel() {
    if (!reason) {
      toast.error("Choose a reason for cancelling.");
      return;
    }
    const full = joinCancelReason(reason, reasonDetails);
    startTransition(async () => {
      const res = await cancelOwnJob(bookingId, full);
      if (res.ok) {
        toast.success("Job cancelled. We're sourcing a replacement.");
        router.push("/mechanic/jobs");
      } else {
        toast.error(res.error);
      }
    });
  }

  const openProposal = rescheduleStatus === "proposed" && !!rescheduleProposedAt;
  // The customer's request (0092) is answered on its own card at the top of the
  // page; only this mechanic's own proposal waits on the customer here.
  const customerRequest = openProposal && rescheduleProposedBy === "customer";
  const pendingProposal = openProposal && !customerRequest;

  return (
    <div className="space-y-5">
      {/* Start the live job. Hidden while the mechanic's own new time is
          awaiting the customer, so the slot isn't started under a contested
          time. A customer's request doesn't block it: setting off keeps the
          booked time and closes the request. */}
      {!pendingProposal && (
        <div>
          <Button
            size="sm"
            fullWidth
            iconLeft={Navigation}
            disabled={pending}
            onClick={() => runLive(startJourney, "You're on the way. The customer's been notified.")}
          >
            Start journey
          </Button>
          <p className="mt-1.5 text-xs text-text-muted">
            Marks you as on the way and shows the customer your live status.
            {customerRequest && " Setting off keeps the booked time and closes the customer's request for a new one."}
          </p>
        </div>
      )}

      {pendingProposal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs font-semibold text-amber-800">
            Reschedule proposed, awaiting customer
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

      {/* Reschedule. While the customer's own request is open, "Suggest
          another time" on its card does this instead. */}
      {!customerRequest && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            <CalendarClock size={12} />
            Propose a new time
          </div>
          <ProposeTimeForm
            bookingId={bookingId}
            initialIso={scheduledAt}
            disabled={pending}
            help="The customer is notified. They can accept it, keep the original slot, have the job offered to another mechanic, or ask Book My Tech to cancel."
          />
        </div>
      )}

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
