import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Car,
  Wrench,
  MapPin,
  CalendarClock,
  User,
  Mail,
  CreditCard,
  ListChecks,
  Settings2,
  Split,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Overline } from "@/components/ui/overline";
import { formatPrice } from "@/lib/utils";
import { calcEarnings } from "@/lib/earnings";
import { Timeline, type TimelineEvent } from "./_components/timeline";
import { BookingActions } from "./_components/booking-actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  sourcing_mechanic: "Sourcing mechanic",
  confirmed: "Confirmed",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

function statusTone(status: string): "active" | "success" | "pending" | "error" | "neutral" {
  if (["confirmed", "en_route", "in_progress"].includes(status)) return "active";
  if (status === "completed") return "success";
  if (status === "sourcing_mechanic") return "pending";
  if (status === "disputed") return "error";
  return "neutral";
}

const PARKING_LABEL: Record<string, string> = {
  driveway: "Driveway",
  street: "On-street",
  car_park: "Car park",
  other: "Other",
};

// Stripe manual-capture PaymentIntent status → human label + pill tone.
function paymentMeta(
  status: string | null,
): { label: string; tone: "active" | "success" | "pending" | "error" | "neutral" } {
  switch (status) {
    case "requires_capture":
      return { label: "Pre-authorised (held)", tone: "active" };
    case "succeeded":
      return { label: "Captured", tone: "success" };
    case "canceled":
      return { label: "Released", tone: "neutral" };
    case "processing":
      return { label: "Processing", tone: "pending" };
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return { label: "Awaiting payment", tone: "pending" };
    default:
      return { label: status ?? "Unknown", tone: "neutral" };
  }
}

async function retrievePaymentStatus(piId: string | null): Promise<string | null> {
  if (!piId) return null;
  try {
    const { stripe } = await import("@/lib/stripe/server");
    const pi = await stripe.paymentIntents.retrieve(piId);
    return pi.status;
  } catch {
    return null;
  }
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `id, status, area, postcode, total_pence, base_price_pence, parts_price_pence,
       commission_rate, platform_fee_pence, mechanic_payout_pence, credit_applied_pence,
       customer_name, customer_email,
       vehicle_reg, vehicle_make, vehicle_model, service_id, mechanic_id,
       scheduled_at, created_at, address_line_1, address_line_2, parking_type,
       special_instructions, stripe_payment_intent_id`,
    )
    .eq("id", id)
    .single();

  if (!booking) notFound();

  const [{ data: service }, { data: events }, { data: mechRows }, paymentStatus] =
    await Promise.all([
      supabase.from("services").select("name").eq("id", booking.service_id).single(),
      supabase
        .from("booking_events")
        .select("id, event_type, actor_role, reason, payload, created_at")
        .eq("booking_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("mechanics")
        .select("id, status, profile:profiles!inner(full_name)")
        .order("created_at", { ascending: false }),
      retrievePaymentStatus(booking.stripe_payment_intent_id),
    ]);

  const mechanics = (mechRows ?? []).map((m) => {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    return {
      id: m.id,
      name: `${profile?.full_name ?? "Unnamed"}${m.status === "online" ? " · online" : ""}`,
    };
  });
  const currentMechanicName =
    mechanics.find((m) => m.id === booking.mechanic_id)?.name ?? null;

  const timelineEvents: TimelineEvent[] = (events ?? []).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    actorRole: e.actor_role,
    reason: e.reason,
    createdAt: e.created_at,
  }));

  const pay = paymentMeta(paymentStatus);

  // Refund state. Refundable = what the customer actually paid minus anything
  // already refunded (summed from the timeline). Refunds only apply to a captured
  // charge; each refund is recovered from the mechanic (see refundBooking).
  const chargedPence = Math.max(
    0,
    (booking.total_pence ?? 0) - (booking.credit_applied_pence ?? 0),
  );
  const alreadyRefundedPence = (events ?? [])
    .filter((e) => e.event_type === "payment_refunded")
    .reduce(
      (sum, e) => sum + ((e.payload as { amount_pence?: number } | null)?.amount_pence ?? 0),
      0,
    );
  const refundablePence = Math.max(0, chargedPence - alreadyRefundedPence);
  const canRefund = paymentStatus === "succeeded" && refundablePence > 0;

  // Commission/payout split. Prefer the values snapshotted on the booking at
  // creation; fall back to recomputing for legacy rows that predate them.
  const hasSnapshot =
    booking.platform_fee_pence != null && booking.mechanic_payout_pence != null;
  const rate = booking.commission_rate ?? 0.15;
  const fallback = calcEarnings(booking.total_pence ?? 0, rate, booking.parts_price_pence ?? 0);
  const split = {
    customerPence: booking.total_pence ?? 0,
    partsPence: booking.parts_price_pence ?? 0,
    platformFeePence: hasSnapshot ? booking.platform_fee_pence! : fallback.platformFeePence,
    mechanicPence: hasSnapshot ? booking.mechanic_payout_pence! : fallback.mechanicPence,
    ratePct: Math.round(rate * 1000) / 10,
    snapshot: hasSnapshot,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/jobs">
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
          Back to jobs
        </Button>
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Overline>Operations</Overline>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-text-primary">
              {booking.id.slice(0, 8)}
            </h1>
            <Pill tone={statusTone(booking.status)}>
              {STATUS_LABEL[booking.status] ?? booking.status}
            </Pill>
          </div>
          <p className="mt-1.5 text-sm text-text-muted">
            Placed {new Date(booking.created_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
            Value
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {formatPrice(booking.total_pence ?? 0)}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-6">
            <CardTitle icon={User}>Customer</CardTitle>
            <Row icon={User} label="Name" value={booking.customer_name ?? "—"} />
            <Row icon={Mail} label="Email" value={booking.customer_email ?? "—"} />
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={Car}>Vehicle &amp; service</CardTitle>
            <Row
              icon={Car}
              label="Vehicle"
              value={[
                booking.vehicle_reg,
                [booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(" "),
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            />
            <Row icon={Wrench} label="Service" value={service?.name ?? "Unknown service"} />
            <Row icon={Wrench} label="Mechanic" value={currentMechanicName ?? "Unassigned"} />
            <Row
              icon={CalendarClock}
              label="Scheduled"
              value={
                booking.scheduled_at
                  ? new Date(booking.scheduled_at).toLocaleString("en-GB", {
                      dateStyle: "full",
                      timeStyle: "short",
                    })
                  : "—"
              }
            />
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={MapPin}>Location</CardTitle>
            <Row
              icon={MapPin}
              label="Address"
              value={[booking.address_line_1, booking.address_line_2, booking.postcode]
                .filter(Boolean)
                .join(", ") || "—"}
            />
            <Row
              icon={MapPin}
              label="Parking"
              value={booking.parking_type ? PARKING_LABEL[booking.parking_type] ?? booking.parking_type : "—"}
            />
            {booking.special_instructions && (
              <Row icon={ListChecks} label="Instructions" value={booking.special_instructions} />
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={ListChecks}>Timeline</CardTitle>
            <Timeline events={timelineEvents} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3 p-6">
            <CardTitle icon={CreditCard}>Payment</CardTitle>
            {booking.stripe_payment_intent_id ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-text-secondary">Status</span>
                  <Pill tone={pay.tone}>{pay.label}</Pill>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-text-secondary">Amount</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {formatPrice(booking.total_pence ?? 0)}
                  </span>
                </div>
                {alreadyRefundedPence > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-text-secondary">Refunded</span>
                    <span className="text-sm font-semibold text-red-600">
                      −{formatPrice(alreadyRefundedPence)}
                    </span>
                  </div>
                )}
                <p className="break-all text-xs text-text-muted">
                  {booking.stripe_payment_intent_id}
                </p>
              </>
            ) : (
              <p className="text-sm text-text-muted">No payment intent on this booking.</p>
            )}
          </Card>

          <Card className="space-y-3 p-6">
            <CardTitle icon={Split}>Split</CardTitle>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">Customer pays</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatPrice(split.customerPence)}
              </span>
            </div>
            {split.partsPence > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-secondary">of which parts</span>
                <span className="text-sm text-text-muted">{formatPrice(split.partsPence)}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary">
                Platform commission ({split.ratePct}%)
              </span>
              <span className="text-sm font-semibold text-success">
                {formatPrice(split.platformFeePence)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-sm text-text-secondary">Mechanic payout</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatPrice(split.mechanicPence)}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Commission is taken on the total; the mechanic&apos;s payout covers the
              parts they front.{" "}
              {split.snapshot
                ? "Locked at booking time."
                : "Estimated — predates the pricing snapshot."}{" "}
              Paid out automatically on completion.
            </p>
          </Card>

          <Card className="space-y-4 p-6">
            <CardTitle icon={Settings2}>Actions</CardTitle>
            <BookingActions
              bookingId={booking.id}
              currentMechanicId={booking.mechanic_id}
              isClosed={booking.status === "cancelled"}
              mechanics={mechanics}
              canRefund={canRefund}
              refundablePence={refundablePence}
              hasMechanic={booking.mechanic_id != null}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function CardTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text-muted">
      <Icon size={14} />
      {children}
    </h2>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={16} className="mt-1 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          {label}
        </p>
        <p className="break-words text-sm font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  );
}
