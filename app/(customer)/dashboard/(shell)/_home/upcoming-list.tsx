import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { bookingStatusMeta } from "@/lib/bookings/status-meta";
import { formatPrice } from "@/lib/utils";
import { Caption, Panel, Section, Stack, StatusPill, Tile } from "@/components/dashboard/ui";

// Booked and not started, soonest first. Each card opens the booking.
export function UpcomingList({ bookings }: { bookings: CustomerBooking[] }) {
  if (bookings.length === 0) return null;
  return (
    <Section title="Upcoming">
      <Stack className="gap-2.5">
        {bookings.map((booking) => {
          const meta = bookingStatusMeta(booking.status);
          return (
            <Link
              key={booking.id}
              href={`/dashboard/bookings/${booking.id}`}
              className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
            >
              <Panel className="transition-colors group-hover:border-slate-300">
                <div className="flex items-center gap-3">
                  <Tile icon={CalendarDays} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-[21px] text-text-primary">{booking.repairDescription}</div>
                    <Caption className="mt-0.5">
                      {booking.whenLabel} · {formatPrice(booking.totalPence)}
                    </Caption>
                  </div>
                  {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}
                </div>
              </Panel>
            </Link>
          );
        })}
      </Stack>
    </Section>
  );
}
