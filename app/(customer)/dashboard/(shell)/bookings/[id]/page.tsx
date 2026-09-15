import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Ban, CalendarClock, ClipboardList, MessageCircle, Phone, Scale, Search, ShieldAlert, Star } from "lucide-react";
import { CANCELLABLE, RESCHEDULABLE } from "@/lib/bookings/manage-booking";
import { bookingStatusMeta, isPastStatus } from "@/lib/bookings/status-meta";
import { loadCustomerBooking, vehicleName } from "@/lib/dashboard/customer-bookings";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes/constants";
import { CLOSED_STATUSES } from "@/lib/messages/send";
import { createClient } from "@/lib/supabase/server";
import { formatJobNumber, formatPrice } from "@/lib/utils";
import {
  AvatarTile,
  buttonClass,
  ButtonLink,
  Caption,
  DetailRow,
  ListCard,
  ListRow,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Section,
  Stack,
  StarRating,
  StatusPill,
} from "@/components/dashboard/ui";
import { RebookControl } from "../../_components/rebook-control";
import { AutoRefresh } from "../../_home/auto-refresh";
import {
  canRebook,
  canReportProblem,
  canReview,
  jobsDoneLabel,
  mechanicFirstName,
  paymentNote,
  telHref,
  waitingOnCustomer,
} from "../../_home/booking-logic";
import { WaitingCard } from "../../_home/waiting-on-you";
import { LiveLocation } from "./_components/live-location";
import { ParkingLabel } from "./_components/parking-label";

// One booking (Task 48; mockup 04 "Booking · En route" and "Booking · Quote
// waiting"): what's waiting on the customer, the mechanic, the details, the
// payment and what they can do next. Read through loadCustomerBooking for the
// cookie session's user, so someone else's booking id is a 404.
export const dynamic = "force-dynamic";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const booking = await loadCustomerBooking({ userId: user.id, email: user.email ?? null }, id);
  if (!booking) notFound();

  const now = new Date();
  const meta = bookingStatusMeta(booking.status);
  const mechanic = booking.mechanic;
  const who = mechanicFirstName(mechanic?.name);
  const waiting = waitingOnCustomer([booking]);
  const messagesOpen = !!mechanic && !(CLOSED_STATUSES as readonly string[]).includes(booking.status);
  const detailHref = `/dashboard/bookings/${booking.id}`;

  const name = vehicleName(booking);
  const vehicle = booking.vehicleReg ? (name !== booking.vehicleReg ? `${name} · ${booking.vehicleReg}` : booking.vehicleReg) : null;
  const where = [booking.addressLine1, booking.addressLine2, booking.postcode].filter((line): line is string => !!line?.trim());
  const note = paymentNote(booking);
  const disputeStatus = booking.dispute
    ? (DISPUTE_STATUS_LABELS as Record<string, string>)[booking.dispute.status]
    : undefined;

  const actions = [
    (RESCHEDULABLE as readonly string[]).includes(booking.status) && (
      <ListRow
        key="reschedule"
        href={`${detailHref}/reschedule`}
        icon={CalendarClock}
        title="Reschedule"
        caption="Choose a different day or time"
      />
    ),
    booking.status === "completed" && booking.hasReport && (
      <ListRow
        key="report"
        href={`${detailHref}/report`}
        icon={ClipboardList}
        title="Service report"
        caption="What your mechanic checked and found"
      />
    ),
    canReview(booking) ? (
      <ListRow key="review" href={`${detailHref}/review`} icon={Star} title="Leave a review" caption={`Tell us how ${who} did`} />
    ) : (
      booking.rating != null && (
        <ListRow
          key="rated"
          icon={Star}
          tone="warn"
          title={`You rated ${booking.rating}/5`}
          trailing={<StarRating value={booking.rating} />}
        />
      )
    ),
    canReportProblem(booking, now) && (
      <ListRow
        key="problem"
        href={`/dashboard/disputes/new/${booking.id}`}
        icon={ShieldAlert}
        title="Report a problem"
        caption="Available for 48 hours after the job is completed"
      />
    ),
    booking.dispute && (
      <ListRow
        key="dispute"
        href={`/dashboard/disputes/${booking.dispute.id}`}
        icon={Scale}
        title="View dispute"
        caption={disputeStatus}
      />
    ),
  ].filter(Boolean);

  return (
    <Screen>
      {!isPastStatus(booking.status) && <AutoRefresh />}

      <PageHeader
        title={booking.jobNumber != null ? `Job ${formatJobNumber(booking.jobNumber)}` : "Your booking"}
        backHref="/dashboard"
        backLabel="Back to Home"
        action={
          meta && (
            <StatusPill tone={meta.tone} pulse={booking.status === "en_route"}>
              {meta.label}
            </StatusPill>
          )
        }
      />

      <Stack>
        <div>
          <h2 className="font-display text-[22px] font-extrabold leading-7 tracking-[-0.5px] text-text-primary">
            {booking.repairDescription}
          </h2>
          {vehicle && <Caption className="mt-1">{vehicle}</Caption>}
        </div>

        {booking.status === "sourcing_mechanic" && (
          <Notice icon={Search} title="Finding you a mechanic">
            Your job has gone out to vetted mechanics near you, and the first to accept takes it. You&apos;ll get an
            email the moment one does.
          </Notice>
        )}

        {waiting.map((item) => (
          <WaitingCard key={item.key} item={item} />
        ))}

        {booking.status === "en_route" && booking.mechanicId && (
          <LiveLocation mechanicId={booking.mechanicId} mechanicName={who} />
        )}

        {mechanic && (
          <Section title="Your mechanic">
            <Panel className="relative transition-colors hover:border-slate-300">
              <div className="flex items-center gap-3">
                <AvatarTile name={mechanic.name} src={mechanic.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/mechanics/${mechanic.id}`}
                    className="text-sm font-bold leading-[21px] text-text-primary after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-blue"
                  >
                    {mechanic.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {mechanic.rating != null && <StarRating value={mechanic.rating} />}
                    <Caption>
                      {mechanic.rating != null ? `${mechanic.rating.toFixed(1)} · ` : ""}
                      {jobsDoneLabel(mechanic.jobCount)}
                    </Caption>
                  </div>
                </div>
                {(messagesOpen || mechanic.phone) && (
                  <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                    {messagesOpen && (
                      <Link
                        href={`${detailHref}/messages`}
                        aria-label={`Message ${who}`}
                        className={buttonClass({ variant: "secondary", size: "sm", className: "w-8 px-0" })}
                      >
                        <MessageCircle size={14} strokeWidth={2.2} aria-hidden />
                      </Link>
                    )}
                    {mechanic.phone && (
                      <a href={telHref(mechanic.phone)} aria-label={`Call ${who}`} className={buttonClass({ size: "sm" })}>
                        <Phone size={14} strokeWidth={2.2} aria-hidden />
                        Call
                      </a>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          </Section>
        )}

        <Section title="Details">
          <ListCard>
            <DetailRow label="When" value={booking.whenLabel} />
            <DetailRow
              label="Where"
              value={where.length ? where.map((line, index) => <div key={`${index}-${line}`}>{line}</div>) : "Not set"}
            />
            {booking.parkingType && <DetailRow label="Parking" value={<ParkingLabel value={booking.parkingType} />} />}
            <DetailRow label="Vehicle" value={vehicle ?? "Not set"} />
            <DetailRow
              label={booking.repairLines.length > 1 ? "Jobs" : "Job"}
              value={booking.repairLines.map((line, index) => (
                <div key={`${index}-${line}`}>{line}</div>
              ))}
            />
            {booking.specialInstructions?.trim() && (
              <DetailRow
                label="Instructions"
                value={<span className="whitespace-pre-line font-normal">{booking.specialInstructions.trim()}</span>}
              />
            )}
          </ListCard>
        </Section>

        <Section title="Payment">
          <ListCard>
            <DetailRow label="Total" value={formatPrice(booking.totalPence)} />
            {booking.partsPricePence > 0 && (
              <DetailRow label="Includes parts" value={formatPrice(booking.partsPricePence)} />
            )}
            {booking.discountPence > 0 && (
              <DetailRow
                label={booking.promoCode ? `Discount (${booking.promoCode})` : "Discount"}
                value={`−${formatPrice(booking.discountPence)}`}
              />
            )}
          </ListCard>
          {note && <Caption className="px-1">{note}</Caption>}
        </Section>

        {actions.length > 0 && (
          <Section title="Manage">
            <ListCard>{actions}</ListCard>
          </Section>
        )}

        {canRebook(booking) && (
          <Panel>
            <RebookControl
              reg={booking.vehicleReg}
              postcode={booking.postcode}
              repairNodeIds={booking.repairNodeIds}
              make={booking.vehicleMake}
              model={booking.vehicleModel}
              mechanicId={booking.mechanicId}
              mechanicName={mechanic?.name ?? null}
            />
          </Panel>
        )}

        {(CANCELLABLE as readonly string[]).includes(booking.status) && (
          <ButtonLink href={`${detailHref}/cancel`} variant="outline-danger" full icon={Ban}>
            Cancel booking
          </ButtonLink>
        )}
      </Stack>
    </Screen>
  );
}
