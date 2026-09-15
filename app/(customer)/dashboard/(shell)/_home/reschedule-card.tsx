"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { respondToReschedule } from "@/app/actions/customer-bookings";
import { Button, Caption, Panel, Tile } from "@/components/dashboard/ui";

// A time the mechanic has proposed, with Accept / Keep my time: the mockups'
// tinted "New time proposed" card. The answer goes through the existing
// respondToReschedule action, the same one components/customer/reschedule-proposal.tsx uses.
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
          Keep my time
        </Button>
      </div>
    </Panel>
  );
}
