"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, X } from "lucide-react";
import { respondToReschedule } from "@/app/actions/customer-bookings";

interface RescheduleProposalProps {
  bookingId: string;
  /** ISO string of the slot the mechanic has proposed. */
  proposedAt: string;
  /** ISO string of the current (original) slot, for the "keep instead" copy. */
  currentAt: string | null;
  note: string | null;
  /**
   * Tighter spacing for the smaller upcoming-booking cards, which are `p-4`
   * themselves — the default sizing is built for the full-width active card.
   */
  compact?: boolean;
}

// Shown to the customer when their mechanic has proposed a new time
// (reschedule_status === 'proposed'). Accept moves the booking to the new slot;
// decline keeps the original. Either way the proposal is consumed server-side.
//
// Rendered in TWO places, and it has to be both: the active booking card, and
// every upcoming booking row. The active card shows only one booking — the live
// job if there is one — so a proposal on any other booking had nowhere to
// appear. A customer with a mechanic already en route simply never saw that a
// different job had been asked to move; the notification email says "we'll be
// in touch" and links nowhere, so it fell to someone to chase by hand.
export function RescheduleProposal({
  bookingId,
  proposedAt,
  currentAt,
  note,
  compact = false,
}: RescheduleProposalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const proposedLabel = new Date(proposedAt).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const currentLabel = currentAt
    ? new Date(currentAt).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  function respond(decision: "accept" | "decline") {
    startTransition(async () => {
      const res = await respondToReschedule(bookingId, decision);
      if (res.ok) {
        toast.success(
          decision === "accept"
            ? "New time confirmed — your mechanic has been notified."
            : "Original time kept — your mechanic has been notified.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div
      className={`rounded-2xl border border-amber-200 bg-amber-50 ${compact ? "p-4" : "p-5"}`}
    >
      <div className={`flex items-start ${compact ? "gap-2.5" : "gap-3"}`}>
        <CalendarClock
          size={compact ? 18 : 20}
          className="mt-0.5 shrink-0 text-amber-600"
        />
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-amber-900 ${compact ? "text-sm" : ""}`}>
            Your mechanic has proposed a new time
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            They&apos;d like to move your booking to{" "}
            <strong>{proposedLabel}</strong>.
            {currentLabel && (
              <>
                {" "}
                Your current slot is {currentLabel}.
              </>
            )}
          </p>
          {note && (
            <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm text-amber-800">
              “{note}”
            </p>
          )}
          <div className={`flex flex-wrap gap-2 ${compact ? "mt-3" : "mt-4"}`}>
            <button
              disabled={pending}
              onClick={() => respond("accept")}
              className={`inline-flex items-center gap-1.5 rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-9" : "h-10"}`}
            >
              <Check size={15} />
              Accept new time
            </button>
            <button
              disabled={pending}
              onClick={() => respond("decline")}
              className={`inline-flex items-center gap-1.5 rounded-button border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-9" : "h-10"}`}
            >
              <X size={15} />
              Keep original
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
