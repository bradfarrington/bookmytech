"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageSquare, Star, MapPin, Clock } from "lucide-react";
import { useStayFresh } from "@/lib/use-stay-fresh";
import { MessagesThread } from "@/components/messages/messages-thread";
import { RescheduleProposal } from "@/components/customer/reschedule-proposal";
import {
  STATUS_LABELS,
  formatSlot,
  type DashboardBooking,
  type MechanicLite,
} from "./types";
import { cn } from "@/lib/utils";

interface ActiveBookingCardProps {
  booking: DashboardBooking;
  mechanic: MechanicLite | null;
}

const LIVE = ["en_route", "in_progress"];

// The prominent top card. Stays current by polling (useStayFresh) as the
// mechanic drives the job forward — no Supabase Realtime, so no table
// replication needed. Call is enabled only once the mechanic is en route / on
// site; messaging is always available once a mechanic is assigned. (Live GPS map
// + ETA are deferred to the native app — we show the booked slot + status here.)
export function ActiveBookingCard({ booking, mechanic }: ActiveBookingCardProps) {
  const router = useRouter();
  const [showMessages, setShowMessages] = useState(false);

  // Re-run the server component periodically so status + reschedule changes show.
  useStayFresh(() => router.refresh(), 20_000);

  const callable = LIVE.includes(booking.status) && !!mechanic?.phone;
  const vehicle = [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(" ");

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-sm">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-brand-gradient px-5 py-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Your active booking
          </p>
          <p className="mt-0.5 font-bold">{booking.repairDescription}</p>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
          {STATUS_LABELS[booking.status] ?? booking.status}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Reschedule proposal (if the mechanic proposed a new time) */}
        {booking.rescheduleStatus === "proposed" && booking.rescheduleProposedAt && (
          <RescheduleProposal
            bookingId={booking.id}
            proposedAt={booking.rescheduleProposedAt}
            currentAt={booking.scheduledAt}
            note={booking.rescheduleNote}
          />
        )}

        {/* Slot + address */}
        <div className="flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-2 text-text-secondary">
            <Clock size={15} className="shrink-0 text-text-muted" />
            {formatSlot(booking.scheduledAt, booking.slotWindow)}
          </p>
          {booking.addressLine1 && (
            <p className="flex items-center gap-2 text-text-secondary">
              <MapPin size={15} className="shrink-0 text-text-muted" />
              {booking.addressLine1}
              {booking.postcode ? `, ${booking.postcode}` : ""}
            </p>
          )}
          <p className="text-text-muted">
            {booking.vehicleReg}
            {vehicle ? ` · ${vehicle}` : ""}
          </p>
        </div>

        {/* Mechanic + actions, once one is assigned */}
        {mechanic ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            {mechanic.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mechanic.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 font-bold text-brand-blue">
                {mechanic.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text-primary">{mechanic.name}</p>
              {mechanic.rating != null && mechanic.rating > 0 && (
                <p className="flex items-center gap-1 text-sm text-text-secondary">
                  <Star size={13} className="fill-amber-400 text-amber-400" />
                  {mechanic.rating.toFixed(1)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {callable ? (
                <a
                  href={`tel:${mechanic.phone}`}
                  aria-label="Call mechanic"
                  className="inline-flex size-10 items-center justify-center rounded-button border border-brand-blue text-brand-blue transition-colors hover:bg-blue-50"
                >
                  <Phone size={16} />
                </a>
              ) : (
                <span
                  title="Calling opens once your mechanic is on the way"
                  className="inline-flex size-10 cursor-not-allowed items-center justify-center rounded-button border border-border text-text-disabled"
                >
                  <Phone size={16} />
                </span>
              )}
              <button
                onClick={() => setShowMessages((v) => !v)}
                aria-label="Message mechanic"
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-button border transition-colors",
                  showMessages
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "border-brand-blue text-brand-blue hover:bg-blue-50",
                )}
              >
                <MessageSquare size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface p-3 text-sm text-text-secondary">
            We&apos;re finding your mechanic — you&apos;ll be able to message and track
            them here the moment one accepts.
          </div>
        )}

        {/* Message thread */}
        {mechanic && showMessages && (
          <MessagesThread
            bookingId={booking.id}
            viewerRole="customer"
            counterpartName={mechanic.name.split(" ")[0]}
          />
        )}
      </div>
    </section>
  );
}
