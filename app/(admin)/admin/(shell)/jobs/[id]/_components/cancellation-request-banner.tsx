"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dismissCancellationRequest } from "@/app/actions/bookings";
import { AdminCancelFlow } from "./admin-cancel-flow";

// The customer's unanswered "please cancel this booking" (lib/bookings/
// cancellation-request.ts), made when they turned down their mechanic's new
// time (0092). An admin either cancels it, through the same flow as the
// Actions card (with the fee the booking's time allows, or waived), or
// dismisses the request, optionally saying why; the booking then carries on
// at its time.
export function CancellationRequestBanner({
  bookingId,
  requestedLabel,
  reason,
  settlesLikeCustomer,
}: {
  bookingId: string;
  /** "25 Nov 2026, 14:05" */
  requestedLabel: string;
  reason: string | null;
  settlesLikeCustomer: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissing, setDismissing] = useState(false);
  const [note, setNote] = useState("");

  function dismiss() {
    startTransition(async () => {
      const res = await dismissCancellationRequest(bookingId, note);
      if (res.ok) {
        toast.success("Request dismissed. The booking carries on at its time.");
        setNote("");
        setDismissing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <Flag size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Cancellation requested</p>
            <p className="mt-1 text-sm text-amber-900">
              The customer asked us to cancel on {requestedLabel}
              {reason ? (
                <>
                  : <span className="italic">&ldquo;{reason}&rdquo;</span>
                </>
              ) : (
                "."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <AdminCancelFlow bookingId={bookingId} settlesLikeCustomer={settlesLikeCustomer} />
            {!dismissing && (
              <Button variant="ghost" size="sm" className="h-9" disabled={pending} onClick={() => setDismissing(true)}>
                Dismiss request
              </Button>
            )}
          </div>

          {dismissing && (
            <div className="rounded-xl border border-amber-200 bg-white p-3.5">
              <label htmlFor="dismiss-note" className="mb-1 block text-xs font-semibold text-text-secondary">
                Note <span className="font-normal text-text-muted">(optional, for the timeline)</span>
              </label>
              <textarea
                id="dismiss-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="For example, spoke to the customer and they'll keep the booking"
                className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={pending} onClick={dismiss}>
                  Dismiss request
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDismissing(false)}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
