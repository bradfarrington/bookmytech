import { notFound, redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadCustomerBooking } from "@/lib/dashboard/customer-bookings";
import { RESCHEDULABLE } from "@/lib/bookings/manage-booking";
import { isLiveStatus } from "@/lib/bookings/status-meta";
import { slotAvailabilityFor } from "@/lib/availability/slot-availability";
import { TWO_HOUR_SLOTS, formatBookingSlot, isSlotBookable, londonDateKey, upcomingDayKeys } from "@/lib/slots";
import { ButtonLink, Caption, Notice, PageHeader, Screen, Stack } from "@/components/dashboard/ui";
import { proposedTime, requestedTime } from "../../../_home/booking-logic";
import { RescheduleRequestCard } from "../../../_home/reschedule-request-card";
import { RescheduleForm } from "./_components/reschedule-form";

// Move a booking (Task 48, mockup 04 "Reschedule"): day chips and the six
// 2-hour windows, with how many mechanics are free in each near the booking's
// address. The move goes through `rescheduleBooking`, which keeps the picked
// window on the booking.
//
// Once a mechanic has accepted (0092), the new time is a request they confirm:
// the booking keeps its time, and its cancellation terms, until they do. The
// page says so before anything is sent, and while a request is with them it
// offers to withdraw that one rather than stacking another on top.
//
// `?mode=another` (0092) is "Find another mechanic", one of the answers to a
// time the mechanic suggested: the picker starts on the time the customer
// first asked for (kept on the mechanic's counter-offer event as
// payload.requested), or the booking's current time, and submitting takes the
// job off this mechanic and offers it to others at the time picked.
//
// All day isn't offered: a reschedule stores one window, and the all-day label
// is deliberately not one the core keeps (lib/bookings/reschedule-window.ts),
// so picking it would quietly become "8:00".

/** How many days ahead the picker offers. The booking flow offers 7; a move is often further out. */
const DAYS_OFFERED = 14;

function firstName(name: string): string {
  return name === "Your mechanic" ? name : name.trim().split(/\s+/)[0] || name;
}

/**
 * The time the customer first asked for before their mechanic countered it:
 * the open proposal's payload.requested, when it is a counter-offer. Null otherwise.
 * Service role: the caller has already been proved to own the booking.
 */
async function timeFirstAskedFor(bookingId: string): Promise<{ at: string; window: string | null } | null> {
  const { data } = await createAdminClient()
    .from("booking_events")
    .select("payload")
    .eq("booking_id", bookingId)
    .eq("event_type", "reschedule_proposed")
    .order("created_at", { ascending: false })
    .limit(1);
  // Only the LATEST proposal counts: the one being answered. If it wasn't a
  // counter, an older counter's requested time is out of date.
  const payload = data?.[0]?.payload as
    | { counter?: boolean; requested?: { at?: string | null; window?: string | null } }
    | null
    | undefined;
  return payload?.counter && payload.requested?.at
    ? { at: payload.requested.at, window: payload.requested.window ?? null }
    : null;
}

export default async function RescheduleBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ id }, { mode: modeParam }] = await Promise.all([params, searchParams]);
  const anotherMechanic = modeParam === "another";
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

  // Confirmed with a mechanic: the new time goes to them to accept (0092).
  const needsConfirmation = booking.status === "confirmed" && !!booking.mechanicId;
  const mechanicName = booking.mechanic ? firstName(booking.mechanic.name) : needsConfirmation ? "Your mechanic" : null;

  if (anotherMechanic && !proposedTime(booking)) {
    return (
      <Screen>
        <PageHeader title="Find another mechanic" backHref={backHref} />
        <Notice
          icon={CalendarClock}
          title="There's no new time from your mechanic to answer"
          action={
            <ButtonLink href={backHref} variant="secondary" size="sm">
              Back to your booking
            </ButtonLink>
          }
        >
          You can choose another mechanic when your mechanic suggests a time that doesn&apos;t suit you.
        </Notice>
      </Screen>
    );
  }

  const requested = requestedTime(booking);
  if (requested) {
    return (
      <Screen>
        <PageHeader title="Change the time" backHref={backHref} />
        <Stack>
          <div>
            <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
              Your request is with {mechanicName === "Your mechanic" || !mechanicName ? "your mechanic" : mechanicName}.
            </h2>
            <p className="mt-1.5 text-sm leading-5 text-text-secondary">
              To ask for a different time, withdraw this request first.
            </p>
          </div>
          <RescheduleRequestCard
            bookingId={booking.id}
            mechanicName={mechanicName ?? "Your mechanic"}
            requestedLabel={formatBookingSlot(requested.at, requested.window)}
            currentLabel={booking.whenLabel}
            note={booking.rescheduleNote}
          />
          <ButtonLink href={backHref} variant="ghost" full>
            Back to your booking
          </ButtonLink>
        </Stack>
      </Screen>
    );
  }

  const now = new Date();
  const days = upcomingDayKeys(now, DAYS_OFFERED);
  const hasOpenWindow = (day: string) => TWO_HOUR_SLOTS.some((slot) => isSlotBookable(day, slot, now));
  // Where the picker starts: the booking's day, or for "Find another mechanic"
  // the time the customer first asked for (window and all), falling back to
  // the booking's current time.
  const start = anotherMechanic
    ? ((await timeFirstAskedFor(booking.id)) ?? { at: booking.scheduledAt, window: booking.slotWindow })
    : { at: booking.scheduledAt, window: null };
  const startDay = start.at ? londonDateKey(new Date(start.at)) : null;
  const initialDay =
    (startDay && days.includes(startDay) && hasOpenWindow(startDay) ? startDay : days.find(hasOpenWindow)) ?? days[0];
  const initialWindow = anotherMechanic && startDay === initialDay ? start.window : null;

  // The first day's counts come with the page; the form asks for other days as they're picked.
  const availability = await slotAvailabilityFor(initialDay, booking.postcode, now).catch(() => null);
  const initialCounts = availability?.ok
    ? Object.fromEntries(availability.windows.map((w) => [w.window, w.mechanics]))
    : null;

  if (anotherMechanic) {
    return (
      <Screen>
        <PageHeader title="Find another mechanic" backHref={backHref} />
        <Stack>
          <div>
            <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
              Pick the time you&apos;d like.
            </h2>
            <p className="mt-1.5 text-sm leading-5 text-text-secondary">
              {mechanicName} won&apos;t do this job. We&apos;ll offer it to other vetted mechanics near you for the
              time you pick, and email you when one accepts. The hold on your card stays as it is.
            </p>
            <Caption className="mt-1.5">Currently {booking.whenLabel}</Caption>
          </div>

          <RescheduleForm
            bookingId={booking.id}
            nowIso={now.toISOString()}
            days={days}
            initialDay={initialDay}
            initialWindow={initialWindow}
            initialCounts={initialCounts}
            currentIso={booking.scheduledAt}
            currentWindow={booking.slotWindow}
            mechanicName={mechanicName}
            mode="another"
            currentLabel={booking.whenLabel}
          />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="Change the time" backHref={backHref} />
      <Stack>
        <div>
          <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
            {needsConfirmation ? "Ask for a new time." : "Pick a new time."}
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">
            {needsConfirmation
              ? `${mechanicName} has accepted this job, so they'll need to confirm the new time or suggest another. Until they do, your booking stays at its current time, and so do its cancellation terms.`
              : mechanicName
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
          mode={needsConfirmation ? "request" : "move"}
          currentLabel={booking.whenLabel}
        />
      </Stack>
    </Screen>
  );
}
