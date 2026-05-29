"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCog, Ban, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cancelBooking, markDisputed, reassignMechanic } from "@/app/actions/bookings";

interface BookingActionsProps {
  bookingId: string;
  currentMechanicId: string | null;
  isClosed: boolean; // cancelled — actions disabled
  mechanics: ReadonlyArray<{ id: string; name: string }>;
}

export function BookingActions({
  bookingId,
  currentMechanicId,
  isClosed,
  mechanics,
}: BookingActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [mechanic, setMechanic] = useState<string>(currentMechanicId ?? "");
  const [cancelReason, setCancelReason] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (isClosed) {
    return (
      <p className="text-sm text-text-muted">
        This booking is cancelled — no further actions are available.
      </p>
    );
  }

  const mechanicOptions = [
    { value: "", label: "Select a mechanic…" },
    ...mechanics.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="space-y-5">
      {/* Reassign */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          <UserCog size={12} />
          Assign / reassign mechanic
        </div>
        <div className="flex gap-2">
          <Select<string>
            value={mechanic}
            onChange={setMechanic}
            options={mechanicOptions}
            aria-label="Choose mechanic"
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={pending || !mechanic || mechanic === currentMechanicId}
            onClick={() => run(() => reassignMechanic(bookingId, mechanic), "Mechanic assigned.")}
          >
            Assign
          </Button>
        </div>
      </div>

      {/* Mark disputed */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          <Flag size={12} />
          Flag as disputed
        </div>
        <textarea
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
          rows={2}
          placeholder="What's the issue?"
          className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={pending || !disputeReason.trim()}
          onClick={() => run(() => markDisputed(bookingId, disputeReason), "Booking flagged as disputed.")}
        >
          Mark disputed
        </Button>
      </div>

      {/* Cancel */}
      <div className="border-t border-border-subtle pt-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-red-600">
          <Ban size={12} />
          Cancel booking
        </div>
        <textarea
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={2}
          placeholder="Reason for cancellation"
          className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-red-400 focus:outline-none"
        />
        <button
          disabled={pending || !cancelReason.trim()}
          onClick={() => run(() => cancelBooking(bookingId, cancelReason), "Booking cancelled.")}
          className="mt-2 inline-flex h-9 items-center rounded-button bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel booking
        </button>
        <p className="mt-1.5 text-xs text-text-muted">
          Releases the Stripe pre-authorisation (auto-releases within 7 days).
          No cancellation fee is taken — that lands in a later task.
        </p>
      </div>
    </div>
  );
}
