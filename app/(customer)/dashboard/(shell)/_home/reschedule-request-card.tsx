"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { withdrawRescheduleRequest } from "@/app/actions/customer-bookings";
import { Button, Caption, Panel, Tile } from "@/components/dashboard/ui";

// The customer's own request for a new time on a confirmed booking (0092),
// waiting on the mechanic. Calm, not a call to action: nothing is needed from
// the customer, and the booking keeps its current time (and its cancellation
// terms) until the mechanic accepts. They can take the request back.
export function RescheduleRequestCard({
  bookingId,
  mechanicName,
  requestedLabel,
  currentLabel,
  note,
}: {
  bookingId: string;
  /** "Alex", or "Your mechanic". */
  mechanicName: string;
  /** "Wed 2 Dec · 2pm–4pm" */
  requestedLabel: string;
  /** The booking's current time as shown elsewhere. */
  currentLabel: string;
  note: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const who = mechanicName === "Your mechanic" ? "your mechanic" : mechanicName;

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawRescheduleRequest(bookingId);
      if (result.ok) {
        toast.success(`Request withdrawn. Your booking stays at ${currentLabel}.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Tile icon={Clock} tone="neutral" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-[21px] text-text-primary">New time requested: {requestedLabel}</div>
          <div className="mt-0.5 text-xs leading-4 text-text-secondary">
            Waiting for {who} to confirm. Your booking stays at {currentLabel} until then.
          </div>
          {note && (
            <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-[13px] leading-[19px] text-text-secondary">
              &ldquo;{note}&rdquo;
            </div>
          )}
          <Caption className="mt-1.5">If they can&apos;t make it, they&apos;ll suggest another time.</Caption>
        </div>
      </div>
      <div className="mt-3 flex">
        <Button size="sm" variant="secondary" disabled={pending} onClick={withdraw}>
          {pending ? "Withdrawing…" : "Withdraw request"}
        </Button>
      </div>
    </Panel>
  );
}
