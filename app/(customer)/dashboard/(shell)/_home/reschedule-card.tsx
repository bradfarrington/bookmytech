"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { askBookMyTechToCancel, respondToReschedule } from "@/app/actions/customer-bookings";
import { Button, ButtonLink, Caption, Panel, Tile } from "@/components/dashboard/ui";
import { findAnotherMechanicHref } from "./booking-logic";

const FIELD =
  "block w-full resize-y rounded-lg border border-border bg-surface-card px-3 py-2.5 text-base leading-5 text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20 sm:text-sm";

// A time the mechanic has proposed (or suggested instead of the one the
// customer asked for): the mockups' tinted "New time proposed" card. Four
// answers (0092): accept it, keep the original time, have the job offered to
// another mechanic at a time of their choosing (the reschedule screen in
// "another" mode), or ask Book My Tech to cancel. The first two go through
// respondToReschedule, the same as components/customer/reschedule-proposal.tsx.
export function RescheduleCard({
  bookingId,
  mechanicName,
  proposedLabel,
  currentLabel,
  note,
  job,
}: {
  bookingId: string;
  /** "Alex", or "Your mechanic". */
  mechanicName: string;
  /** "Thu 15 Jan at 2pm" */
  proposedLabel: string;
  /** The booking's current time as shown elsewhere. */
  currentLabel: string;
  note: string | null;
  /** On Home, which booking this is about. */
  job?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [askingToCancel, setAskingToCancel] = useState(false);
  const [reason, setReason] = useState("");

  function respond(decision: "accept" | "decline") {
    startTransition(async () => {
      const result = await respondToReschedule(bookingId, decision);
      if (result.ok) {
        toast.success(
          decision === "accept"
            ? "New time confirmed. We've let your mechanic know."
            : "You've kept your original time. We've let your mechanic know.",
        );
        router.refresh();
      } else {
        toast.error(result.error);
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
      const result = await askBookMyTechToCancel(bookingId, trimmed);
      if (result.ok) {
        toast.success(`Sent to Book My Tech. We'll be in touch. Your booking stays at ${currentLabel} for now.`);
        setReason("");
        setAskingToCancel(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Panel tone="tint">
      <div className="flex items-start gap-3">
        <Tile icon={CalendarClock} className="bg-white" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-[21px] text-text-primary">New time proposed</div>
          <div className="mt-0.5 text-xs leading-4 text-text-secondary">
            {mechanicName} has asked to move {job ? `your ${job}` : "your booking"} to {proposedLabel}.
          </div>
          <Caption className="mt-1">Your current time is {currentLabel}.</Caption>
          {note && (
            <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-[13px] leading-[19px] text-text-secondary">
              &ldquo;{note}&rdquo;
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" disabled={pending} onClick={() => respond("accept")}>
          Accept
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" disabled={pending} onClick={() => respond("decline")}>
          Keep my original time
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <ButtonLink href={findAnotherMechanicHref(bookingId)} size="sm" variant="ghost" className="flex-1">
          Find another mechanic
        </ButtonLink>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1"
          disabled={pending}
          aria-expanded={askingToCancel}
          onClick={() => setAskingToCancel((open) => !open)}
        >
          Ask Book My Tech to cancel
        </Button>
      </div>

      {askingToCancel && (
        <div className="mt-3 rounded-xl bg-white p-3">
          <label htmlFor={`ask-cancel-${bookingId}`} className="mb-1.5 block text-xs font-semibold text-text-secondary">
            Why would you like it cancelled?
          </label>
          <textarea
            id={`ask-cancel-${bookingId}`}
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example, neither time works for me"
            className={FIELD}
          />
          <Caption className="mt-1.5">
            Your booking keeps its current time while we look at it. We decide whether a cancellation fee applies,
            under our cancellation terms, based on your booking&apos;s time.
          </Caption>
          <Button size="sm" variant="dark" className="mt-2.5" disabled={pending || !reason.trim()} onClick={askToCancel}>
            Send to Book My Tech
          </Button>
        </div>
      )}
    </Panel>
  );
}
