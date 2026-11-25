"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { adminCancellationQuote, cancelBooking } from "@/app/actions/bookings";

// Cancel a booking as Book My Tech. While the customer could still cancel it
// themselves (finding a mechanic, confirmed, on the way), `cancelBooking`
// settles it exactly as their own cancel would: the fee the booking's CURRENT
// time allows is captured from the hold (or waived), the rest released, the
// mechanic paid their share, everyone told. So the confirm step shows that fee,
// fetched fresh when the step opens, with a switch to waive it. Any other
// status only closes the booking, as before.
//
// Used in the Actions card and in the banner for a mechanic's "please cancel".

type Quote = { feePence: number; label: string } | null;

/** The customer-facing tier label, reworded for staff: "your slot" is the customer's. */
function staffLabel(label: string): string {
  return label.replace(/\byour slot\b/gi, "the slot").replace(/\byour mechanic\b/gi, "the mechanic");
}

export function AdminCancelFlow({
  bookingId,
  settlesLikeCustomer,
}: {
  bookingId: string;
  /** Status is sourcing_mechanic / confirmed / en_route: the fee rules apply. */
  settlesLikeCustomer: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Quote>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [chargeFee, setChargeFee] = useState(true);
  const [reason, setReason] = useState("");

  function openConfirm() {
    if (!settlesLikeCustomer) {
      setOpen(true);
      return;
    }
    startTransition(async () => {
      const res = await adminCancellationQuote(bookingId);
      if (res.ok) {
        setQuote({ feePence: res.feePence, label: staffLabel(res.label) });
        setQuoteFailed(false);
      } else {
        setQuote(null);
        setQuoteFailed(true);
      }
      setChargeFee(true);
      setOpen(true);
    });
  }

  function close() {
    setOpen(false);
    setReason("");
  }

  function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("A cancellation reason is required.");
      return;
    }
    startTransition(async () => {
      const res = await cancelBooking(bookingId, trimmed, settlesLikeCustomer ? chargeFee : true);
      if (res.ok) {
        toast.success(
          settlesLikeCustomer ? "Booking cancelled. The customer and mechanic have been told." : "Booking cancelled.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={openConfirm}
        className="inline-flex h-9 items-center gap-1.5 rounded-button bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Ban size={14} aria-hidden />
        {pending ? "Working out the fee…" : "Cancel booking"}
      </button>
    );
  }

  const feeDue = quote?.feePence ?? 0;

  return (
    <div className="w-full space-y-3 rounded-xl border border-red-200 bg-white p-3.5">
      {settlesLikeCustomer && quote && feeDue > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-text-primary">
            Cancellation fee due: <strong>{formatPrice(feeDue)}</strong>. {quote.label}.
          </p>
          <label className="flex items-center gap-2.5 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={chargeFee}
              onChange={(e) => setChargeFee(e.target.checked)}
              className="size-4 rounded border-border accent-brand-blue"
            />
            Charge the {formatPrice(feeDue)} fee
          </label>
          <p className="text-xs text-text-muted">
            {chargeFee
              ? "We take the fee from the hold on the customer's card and release the rest. The mechanic is paid their share."
              : "The fee is waived and the whole hold on the customer's card is released."}
          </p>
        </div>
      )}
      {settlesLikeCustomer && quote && feeDue === 0 && (
        <p className="text-sm text-text-secondary">
          No fee applies ({quote.label.toLowerCase()}). The whole hold on the customer&apos;s card is released.
        </p>
      )}
      {settlesLikeCustomer && quoteFailed && (
        <div className="space-y-2">
          <p className="text-sm text-amber-800">
            We couldn&apos;t work out the fee just now. Any fee the booking&apos;s time allows is worked out when you confirm.
          </p>
          <label className="flex items-center gap-2.5 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={chargeFee}
              onChange={(e) => setChargeFee(e.target.checked)}
              className="size-4 rounded border-border accent-brand-blue"
            />
            Charge the cancellation fee, if one applies
          </label>
        </div>
      )}
      {!settlesLikeCustomer && (
        <p className="text-sm text-text-secondary">
          This closes the booking without touching the payment. Use a refund for any money owed.
        </p>
      )}

      <div>
        <label htmlFor={`cancel-reason-${bookingId}`} className="mb-1 block text-xs font-semibold text-text-secondary">
          Reason <span className="font-normal text-text-muted">(required)</span>
        </label>
        <textarea
          id={`cancel-reason-${bookingId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for cancellation"
          className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-red-400 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" size="sm" disabled={pending || !reason.trim()} onClick={confirm}>
          {settlesLikeCustomer && quote && feeDue > 0 && chargeFee
            ? `Cancel and charge ${formatPrice(feeDue)}`
            : "Confirm cancellation"}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={close}>
          Back
        </Button>
      </div>
    </div>
  );
}
