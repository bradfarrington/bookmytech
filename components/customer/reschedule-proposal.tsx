"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, X } from "lucide-react";
import { askBookMyTechToCancel, respondToReschedule } from "@/app/actions/customer-bookings";

interface RescheduleProposalProps {
  bookingId: string;
  /** ISO string of the slot the mechanic has proposed. */
  proposedAt: string;
  /** ISO string of the current (original) slot, for the "keep instead" copy. */
  currentAt: string | null;
  /**
   * The current slot as the customer sees it elsewhere ("Wed 3 Sep · 8am–10am",
   * or "Any of … · All day" for a flexible booking). Preferred over `currentAt`,
   * which can only be shown as an exact time.
   */
  currentLabel?: string | null;
  note: string | null;
  /**
   * Tighter spacing for the smaller upcoming-booking cards, which are `p-4`
   * themselves — the default sizing is built for the full-width active card.
   */
  compact?: boolean;
  /**
   * The viewer is signed in. "Find another mechanic" and "Ask Book My Tech to
   * cancel" (0092) go through the cookie session's ownership check, so a guest
   * is pointed to sign in for them instead.
   */
  signedIn?: boolean;
}

// Shown to the customer when their mechanic has proposed a new time
// (reschedule_status === 'proposed', proposed_by not 'customer'). Accept moves
// the booking to the new slot; decline keeps the original. Either way the
// proposal is consumed server-side. Since 0092 there are two more answers:
// have the job offered to another mechanic (the dashboard's reschedule screen
// in "another" mode), or ask Book My Tech to cancel.
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
  currentLabel: currentLabelProp,
  note,
  compact = false,
  signedIn = false,
}: RescheduleProposalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [askingToCancel, setAskingToCancel] = useState(false);
  const [reason, setReason] = useState("");
  const bookingHref = `/dashboard/bookings/${bookingId}`;

  const proposedLabel = new Date(proposedAt).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const currentLabel =
    currentLabelProp ??
    (currentAt
      ? new Date(currentAt).toLocaleString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "numeric",
          minute: "2-digit",
        })
      : null);

  function respond(decision: "accept" | "decline") {
    startTransition(async () => {
      const res = await respondToReschedule(bookingId, decision);
      if (res.ok) {
        toast.success(
          decision === "accept"
            ? "New time confirmed. Your mechanic has been notified."
            : "Original time kept. Your mechanic has been notified.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function askToCancel() {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Tell us why you'd like it cancelled.");
      return;
    }
    startTransition(async () => {
      const res = await askBookMyTechToCancel(bookingId, trimmed);
      if (res.ok) {
        toast.success("Sent to Book My Tech. We'll be in touch. Your booking keeps its original time for now.");
        setReason("");
        setAskingToCancel(false);
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
              Keep my original time
            </button>
          </div>
          {signedIn ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link
                href={`${bookingHref}/reschedule?mode=another`}
                className="font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                Find another mechanic
              </Link>
              <button
                type="button"
                disabled={pending}
                aria-expanded={askingToCancel}
                onClick={() => setAskingToCancel((open) => !open)}
                className="font-semibold text-amber-900 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Ask Book My Tech to cancel
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-800">
              Rather have another mechanic, or ask us to cancel?{" "}
              <Link
                href={`/login?next=${encodeURIComponent(bookingHref)}`}
                className="font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                Sign in
              </Link>{" "}
              for every option.
            </p>
          )}
          {signedIn && askingToCancel && (
            <div className="mt-3 rounded-lg bg-white/70 p-3">
              <label htmlFor={`ask-cancel-${bookingId}`} className="block text-xs font-semibold text-amber-900">
                Why would you like it cancelled?
              </label>
              <textarea
                id={`ask-cancel-${bookingId}`}
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example, neither time works for me"
                className="mt-1.5 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-amber-800">
                Your booking keeps its original time while we look at it. We decide whether a cancellation fee
                applies, under our cancellation terms, based on your booking&apos;s time.
              </p>
              <button
                type="button"
                disabled={pending || !reason.trim()}
                onClick={askToCancel}
                className="mt-2 inline-flex h-9 items-center rounded-button bg-text-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send to Book My Tech
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
