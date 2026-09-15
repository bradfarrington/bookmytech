import { notFound, redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadCustomerBooking } from "@/lib/dashboard/customer-bookings";
import { RESCHEDULABLE } from "@/lib/bookings/manage-booking";
import { isLiveStatus } from "@/lib/bookings/status-meta";
import { slotAvailabilityFor } from "@/lib/availability/slot-availability";
import { TWO_HOUR_SLOTS, isSlotBookable, londonDateKey, upcomingDayKeys } from "@/lib/slots";
import { ButtonLink, Caption, Notice, PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { RescheduleForm } from "./_components/reschedule-form";

// Move a booking (Task 48, mockup 04 "Reschedule"): day chips and the six
// 2-hour windows, with how many mechanics are free in each near the booking's
// address. The move goes through `rescheduleBooking`, which keeps the picked
// window on the booking.
//
// All day isn't offered: a reschedule stores one window, and the all-day label
// is deliberately not one the core keeps (lib/bookings/reschedule-window.ts),
// so picking it would quietly become "8:00".

/** How many days ahead the picker offers. The booking flow offers 7; a move is often further out. */
const DAYS_OFFERED = 14;

function firstName(name: string): string {
  return name === "Your mechanic" ? name : name.trim().split(/\s+/)[0] || name;
}

export default async function RescheduleBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const booking = await loadCustomerBooking({ userId: user.id, email: user.email ?? null }, id);
  if (!booking) notFound();

  const backHref = `/dashboard/bookings/${booking.id}`;

  if (!(RESCHEDULABLE as readonly string[]).includes(booking.status)) {
    return (
      <Screen>
        <PageHeader title="Change the time" backHref={backHref} />
        <Notice
          icon={CalendarClock}
          title="This booking can't be moved now"
          action={
            <ButtonLink href={backHref} variant="secondary" size="sm">
              Back to your booking
            </ButtonLink>
          }
        >
          {isLiveStatus(booking.status)
            ? "Your mechanic is already on the way or working on it, so the time can't be changed here. Message them if something's come up."
            : "Only a booking that hasn't started yet can be moved."}
        </Notice>
      </Screen>
    );
  }

  const now = new Date();
  const days = upcomingDayKeys(now, DAYS_OFFERED);
  const hasOpenWindow = (day: string) => TWO_HOUR_SLOTS.some((slot) => isSlotBookable(day, slot, now));
  const currentDay = booking.scheduledAt ? londonDateKey(new Date(booking.scheduledAt)) : null;
  const initialDay =
    (currentDay && days.includes(currentDay) && hasOpenWindow(currentDay) ? currentDay : days.find(hasOpenWindow)) ??
    days[0];

  // The first day's counts come with the page; the form asks for other days as they're picked.
  const availability = await slotAvailabilityFor(initialDay, booking.postcode, now).catch(() => null);
  const initialCounts = availability?.ok
    ? Object.fromEntries(availability.windows.map((w) => [w.window, w.mechanics]))
    : null;

  const mechanicName = booking.mechanic ? firstName(booking.mechanic.name) : null;

  return (
    <Screen>
      <PageHeader title="Change the time" backHref={backHref} />
      <Stack>
        <div>
          <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
            Pick a new time.
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">
            {mechanicName
              ? `${mechanicName} keeps the job and is told about the change.`
              : "We're still finding you a mechanic, and they'll see the new time."}
          </p>
          <Caption className="mt-1.5">Currently {booking.whenLabel}</Caption>
        </div>

        <RescheduleForm
          bookingId={booking.id}
          nowIso={now.toISOString()}
          days={days}
          initialDay={initialDay}
          initialCounts={initialCounts}
          currentIso={booking.scheduledAt}
          currentWindow={booking.slotWindow}
          mechanicName={mechanicName}
        />
      </Stack>
    </Screen>
  );
}
