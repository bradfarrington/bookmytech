"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { withdrawRescheduleRequest } from "@/app/actions/customer-bookings";

interface RescheduleRequestProps {
  bookingId: string;
  /** The time the customer asked for: "Wed 2 Dec · 2pm–4pm". */
  requestedLabel: string;
  /** The booking's current time, which it keeps until the mechanic accepts. */
  currentLabel: string | null;
  note: string | null;
  /**
   * Offer "Withdraw request". Only for a signed-in viewer: withdrawing goes
   * through the cookie session's ownership check, which a guest doesn't have.
   */
  canWithdraw: boolean;
}

// The customer's own request for a new time on a confirmed booking (0092),
// waiting on the mechanic. The confirmation page's counterpart to the
// dashboard's RescheduleRequestCard, in this page's card style. Calm on
// purpose: nothing is needed from the customer.
export function RescheduleRequest({
  bookingId,
  requestedLabel,
  currentLabel,
  note,
  canWithdraw,
}: RescheduleRequestProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function withdraw() {
    startTransition(async () => {
      const res = await withdrawRescheduleRequest(bookingId);
      if (res.ok) {
        toast.success(currentLabel ? `Request withdrawn. Your booking stays at ${currentLabel}.` : "Request withdrawn.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <Clock size={20} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary">New time requested: {requestedLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            Waiting for your mechanic to confirm.
            {currentLabel && <> Your booking stays at {currentLabel} until then.</>}
          </p>
          {note && (
            <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-sm text-text-secondary">&ldquo;{note}&rdquo;</p>
          )}
          {canWithdraw && (
            <div className="mt-4">
              <button
                type="button"
                disabled={pending}
                onClick={withdraw}
                className="inline-flex h-10 items-center rounded-button border border-border bg-white px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Withdrawing…" : "Withdraw request"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
