import { notFound, redirect } from "next/navigation";
import { Ban, CircleCheck, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerBooking } from "@/lib/dashboard/customer-bookings";
import { CANCELLABLE, quoteCancellationFor } from "@/lib/bookings/manage-booking";
import { cancellationPolicy } from "@/lib/bookings/cancellation-policy";
import { cn, formatJobNumber, formatPrice } from "@/lib/utils";
import {
  ButtonLink,
  Caption,
  DetailRow,
  ListCard,
  Notice,
  PageHeader,
  Panel,
  Screen,
  Section,
  Stack,
  TextLink,
  Tile,
} from "@/components/dashboard/ui";
import { CancelForm } from "./_components/cancel-form";

// Cancel a booking (Task 48, mockup 04 "Cancel confirm"). The fee shown is
// `quoteCancellationFor`, a preview: `cancelBookingFor` works it out again at
// the moment of cancelling. What the card says about the hold is what that
// function does: a fee is captured from the pre-authorisation and the rest is
// released; no fee releases all of it; a booking with no card hold (account
// credit covered it, payment_mode 'free') has nothing to charge.

export default async function CancelBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const caller = { userId: user.id, email: user.email ?? null };
  const booking = await loadCustomerBooking(caller, id);
  if (!booking) notFound();

  const backHref = `/dashboard/bookings/${booking.id}`;
  const title = booking.jobNumber != null ? `Job ${formatJobNumber(booking.jobNumber)}` : "Cancel booking";

  if (!(CANCELLABLE as readonly string[]).includes(booking.status)) {
    return (
      <Screen>
        <PageHeader title={title} backHref={backHref} />
        <Notice
          icon={Ban}
          title="This booking can't be cancelled here"
          action={
            <ButtonLink href={backHref} variant="secondary" size="sm">
              Back to your booking
            </ButtonLink>
          }
        >
          {booking.status === "in_progress"
            ? "Your mechanic has already started the work. Message them if something's wrong."
            : booking.status === "cancelled"
              ? "This booking has already been cancelled."
              : "Only a booking that hasn't started yet can be cancelled."}
        </Notice>
      </Screen>
    );
  }

  const [quote, policy] = await Promise.all([
    quoteCancellationFor(booking.id, caller),
    cancellationPolicy(createAdminClient()),
  ]);

  const noCardHold = booking.paymentMode === "free";

  return (
    <Screen>
      <PageHeader title={title} backHref={backHref} />
      <Stack>
        <div>
          <h2 className="font-display text-xl font-extrabold leading-[26px] tracking-[-0.4px] text-text-primary">
            Cancel this booking?
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">
            {booking.mechanic
              ? "Your mechanic will be told straight away."
              : "No mechanic has taken the job yet."}
          </p>
          <Caption className="mt-1.5">
            {booking.repairDescription} · {booking.whenLabel}
          </Caption>
        </div>

        {noCardHold ? (
          <FreeCard>
            Nothing is held on a card for this booking, so there&apos;s no fee to pay.
          </FreeCard>
        ) : !quote.ok ? (
          <Notice icon={TriangleAlert} tone="warn" title="We couldn't work out the fee just now">
            You can still cancel. Any fee is worked out when you confirm, using the policy below.
          </Notice>
        ) : quote.feePence === 0 ? (
          <FreeCard>
            No fee applies ({quote.label.toLowerCase()}). The whole hold on your card is released.
          </FreeCard>
        ) : (
          <Panel tone="danger">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs leading-4 text-red-900">Cancellation fee</div>
                <div className="mt-1 font-display text-[17px] font-bold leading-[22px] text-red-700">
                  {formatPrice(quote.feePence)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs leading-4 text-red-900">Rest of your card hold</div>
                <div className="mt-1 font-display text-[17px] font-bold leading-[22px] text-text-primary">Released</div>
              </div>
            </div>
            <div className="my-3 h-px bg-red-200" />
            <p className="text-xs leading-[18px] text-text-secondary">
              A {formatPrice(quote.feePence)} fee applies ({quote.label.toLowerCase()}). We take only the fee from the
              hold on your card and release the rest. Your bank may take a few days to show it.
            </p>
          </Panel>
        )}

        <CancelForm bookingId={booking.id} backHref={backHref}>
          <Section title="Cancellation policy" action={<TextLink href="/cancellation-policy">Full policy</TextLink>}>
            <ListCard>
              {policy.tiers.map((tier) => (
                <DetailRow
                  key={tier.key}
                  label={tier.label}
                  value={
                    <span
                      className={cn(
                        "text-[13px] font-bold",
                        tier.feePence === 0
                          ? "text-green-700"
                          : tier.key === "en_route"
                            ? "text-red-600"
                            : "text-amber-600",
                      )}
                    >
                      {tier.feePence === 0 ? "Free" : formatPrice(tier.feePence)}
                    </span>
                  }
                />
              ))}
            </ListCard>
            <Caption>Moving your booking instead is always free.</Caption>
          </Section>
        </CancelForm>
      </Stack>
    </Screen>
  );
}

function FreeCard({ children }: { children: React.ReactNode }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Tile icon={CircleCheck} tone="success" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-bold leading-[22px] text-text-primary">Free to cancel</div>
          <p className="mt-1 text-[13px] leading-[19px] text-text-secondary">{children}</p>
        </div>
      </div>
    </Panel>
  );
}
