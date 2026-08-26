"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Ban, X } from "lucide-react";
import {
  quoteCancellation,
  cancelBooking,
  rescheduleBooking,
  type CancellationQuote,
} from "@/app/actions/customer-bookings";
import { RescheduleProposal } from "@/components/customer/reschedule-proposal";
import { SectionHeading } from "./section-heading";
import { formatPrice } from "@/lib/utils";
import {
  STATUS_LABELS,
  STATUS_TONES,
  formatSlot,
  type DashboardBooking,
  type MechanicLite,
} from "./types";

interface UpcomingBookingsProps {
  bookings: DashboardBooking[];
  mechanics: Record<string, MechanicLite>;
}

type Panel = { id: string; mode: "cancel" | "reschedule" } | null;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function UpcomingBookings({ bookings, mechanics }: UpcomingBookingsProps) {
  return (
    <section>
      <SectionHeading count={bookings.length}>Upcoming bookings</SectionHeading>
      <div className="flex flex-col gap-3">
        {bookings.map((b) => (
          <UpcomingRow
            key={b.id}
            booking={b}
            mechanic={b.mechanicId ? mechanics[b.mechanicId] ?? null : null}
          />
        ))}
      </div>
    </section>
  );
}

function UpcomingRow({
  booking,
  mechanic,
}: {
  booking: DashboardBooking;
  mechanic: MechanicLite | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [pending, startTransition] = useTransition();

  // Cancel state
  const [reason, setReason] = useState("");
  const [quote, setQuote] = useState<CancellationQuote | null>(null);

  // Reschedule state
  const [newTime, setNewTime] = useState(() => toLocalInput(booking.scheduledAt));
  const [rescheduleReason, setRescheduleReason] = useState("");

  function openCancel() {
    setPanel({ id: booking.id, mode: "cancel" });
    setQuote(null);
    startTransition(async () => {
      const q = await quoteCancellation(booking.id);
      setQuote(q);
    });
  }

  function confirmCancel() {
    if (!reason.trim()) {
      toast.error("Please add a reason.");
      return;
    }
    startTransition(async () => {
      const res = await cancelBooking(booking.id, reason.trim());
      if (res.ok) {
        toast.success("Booking cancelled.");
        setPanel(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function confirmReschedule() {
    if (!newTime) {
      toast.error("Pick a new date and time.");
      return;
    }
    const iso = new Date(newTime).toISOString();
    startTransition(async () => {
      const res = await rescheduleBooking(booking.id, iso, rescheduleReason);
      if (res.ok) {
        toast.success("Booking rescheduled.");
        setPanel(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const open = panel?.id === booking.id ? panel.mode : null;
  // Narrowed to a string (not a boolean flag) so the JSX below needs no
  // non-null assertion — the guard and the value are the same expression.
  const proposedAt =
    booking.rescheduleStatus === "proposed" ? booking.rescheduleProposedAt : null;

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">{booking.repairDescription}</p>
          <p className="mt-0.5 text-sm text-text-secondary">{formatSlot(booking.scheduledAt, booking.slotWindow)}</p>
          <p className="mt-0.5 text-sm text-text-muted">
            {mechanic ? mechanic.name : "Finding your mechanic"}
            {" · "}
            {booking.vehicleReg}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            proposedAt
              ? "bg-amber-100 text-amber-800"
              : STATUS_TONES[booking.status] ?? "bg-surface text-text-secondary"
          }`}
        >
          {proposedAt
            ? "Change requested"
            : STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </div>

      {/* A time the MECHANIC proposed. Needs answering before the buttons below
          are much use, so it sits above them. Without this the request was
          invisible whenever another job held the single active-booking card. */}
      {proposedAt && !open && (
        <div className="mt-3">
          <RescheduleProposal
            compact
            bookingId={booking.id}
            proposedAt={proposedAt}
            currentAt={booking.scheduledAt}
            note={booking.rescheduleNote}
          />
        </div>
      )}

      {!open && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              setPanel({ id: booking.id, mode: "reschedule" });
              setNewTime(toLocalInput(booking.scheduledAt));
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
          >
            <CalendarClock size={15} />
            Reschedule
          </button>
          <button
            onClick={openCancel}
            className="inline-flex h-9 items-center gap-1.5 rounded-button border border-red-200 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <Ban size={15} />
            Cancel
          </button>
        </div>
      )}

      {/* Cancel panel */}
      {open === "cancel" && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Cancel this booking</p>
            <button onClick={() => setPanel(null)} aria-label="Close" className="text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>

          {quote === null ? (
            <p className="text-sm text-text-muted">Checking cancellation fee…</p>
          ) : quote.ok ? (
            <p className="mb-2 text-sm text-text-secondary">
              {quote.feePence > 0 ? (
                <>
                  A cancellation fee of <strong>{formatPrice(quote.feePence)}</strong> applies
                  ({quote.label.toLowerCase()}). The rest of your pre-authorisation is
                  released.
                </>
              ) : (
                <>No cancellation fee applies — your full pre-authorisation is released.</>
              )}
            </p>
          ) : (
            <p className="mb-2 text-sm text-red-600">{quote.error}</p>
          )}

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason for cancelling"
            className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-red-400 focus:outline-none"
          />
          <button
            onClick={confirmCancel}
            disabled={pending || !(quote?.ok ?? false)}
            className="mt-2 inline-flex h-9 items-center rounded-button bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm cancellation
          </button>
        </div>
      )}

      {/* Reschedule panel */}
      {open === "reschedule" && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">Pick a new time</p>
            <button onClick={() => setPanel(null)} aria-label="Close" className="text-text-muted hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
          <input
            type="datetime-local"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary focus:border-brand-blue focus:outline-none"
          />
          <textarea
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            rows={2}
            placeholder="Reason (optional)"
            className="mt-2 w-full rounded-button border border-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-blue focus:outline-none"
          />
          <p className="mt-1 text-xs text-text-muted">
            Your mechanic stays the same and is notified of the new time.
          </p>
          <button
            onClick={confirmReschedule}
            disabled={pending || !newTime}
            className="mt-2 inline-flex h-9 items-center rounded-button bg-brand-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm new time
          </button>
        </div>
      )}
    </div>
  );
}
