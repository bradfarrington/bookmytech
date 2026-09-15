import Link from "next/link";
import type { CustomerBooking } from "@/lib/dashboard/customer-bookings";
import { bookingStatusMeta } from "@/lib/bookings/status-meta";
import { formatPrice } from "@/lib/utils";
import { Caption, Panel, Section, Stack, StarRating, StatusPill, TextLink } from "@/components/dashboard/ui";
import { mechanicShortName, PAST_JOBS_SHOWN, pastJobAction, shortDate } from "./booking-logic";
import { ShowMore } from "./show-more";

// Finished jobs, newest first: the latest few, then "Show N more". Each card
// opens the booking; its one link (View dispute, Rate your mechanic or Book
// again) sits above that.

function PastJobCard({ booking, now }: { booking: CustomerBooking; now: Date }) {
  const action = pastJobAction(booking);
  const date = booking.completedAt ?? booking.scheduledAt;
  const caption = [date ? shortDate(date, now) : null, mechanicShortName(booking.mechanic?.name)]
    .filter(Boolean)
    .join(" · ");
  const meta = booking.status === "completed" ? null : bookingStatusMeta(booking.status);

  return (
    <Panel className="relative transition-colors hover:border-slate-300">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="text-sm font-bold leading-[21px] text-text-primary after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-blue"
          >
            {booking.repairDescription}
          </Link>
          {(caption || meta) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {caption && <Caption>{caption}</Caption>}
              {meta && <StatusPill tone={meta.tone}>{meta.label}</StatusPill>}
            </div>
          )}
          {booking.rating != null && <StarRating value={booking.rating} className="mt-1.5" />}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="text-sm font-bold leading-[21px] text-text-primary">{formatPrice(booking.totalPence)}</div>
          {action && (
            <TextLink href={action.href} className="relative z-10">
              {action.label}
            </TextLink>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function PastJobs({ bookings, now }: { bookings: CustomerBooking[]; now: Date }) {
  if (bookings.length === 0) return null;
  const shown = bookings.slice(0, PAST_JOBS_SHOWN);
  const rest = bookings.slice(PAST_JOBS_SHOWN);
  return (
    <Section title="Past jobs">
      <Stack className="gap-2.5">
        {shown.map((booking) => (
          <PastJobCard key={booking.id} booking={booking} now={now} />
        ))}
        {rest.length > 0 && (
          <ShowMore label={`Show ${rest.length} more`}>
            {rest.map((booking) => (
              <PastJobCard key={booking.id} booking={booking} now={now} />
            ))}
          </ShowMore>
        )}
      </Stack>
    </Section>
  );
}
