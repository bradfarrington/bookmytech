import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle, ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatJobNumber } from "@/lib/utils";
import { formatBookingSlot } from "@/lib/slots";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingTracker, type BookingMechanic } from "./_components/booking-tracker";
import { RescheduleProposal } from "@/components/customer/reschedule-proposal";

interface ConfirmedPageProps {
  params: Promise<{ id: string }>;
}

// Reflect live status as the mechanic drives the job forward (the tracker reads
// the same booking the mechanic mutates). Mechanic actions revalidate this
// path; a refresh always shows the latest.
export const dynamic = "force-dynamic";

export default async function ConfirmedPage({ params }: ConfirmedPageProps) {
  const { id } = await params;
  // Service-role read: guests have no auth session, so the customer-scoped
  // RLS policy on `bookings` wouldn't let them see their own confirmation.
  // Safe because (a) we look up by full UUID, (b) the page surfaces nothing
  // not already in the customer's confirmation email.
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, job_number, vehicle_reg, vehicle_make, vehicle_model, scheduled_at, slot_window, created_at, total_pence, customer_name, customer_email, address_line_1, status, mechanic_id, reschedule_status, reschedule_proposed_at, reschedule_note")
    .eq("id", id)
    .single();

  if (!booking) notFound();

  // Is the viewer already signed in? If so, route them to their dashboard
  // instead of nudging them to create an account.
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  const signedIn = Boolean(user);

  const signupHref = `/signup?${new URLSearchParams({
    ...(booking.customer_name ? { name: booking.customer_name } : {}),
    ...(booking.customer_email ? { email: booking.customer_email } : {}),
  }).toString()}`;

  // Reveal the mechanic once one is assigned (confirmed and beyond). Name +
  // avatar from profiles, rating from mechanics.
  let mechanic: BookingMechanic | null = null;
  if (booking.mechanic_id) {
    const [{ data: profile }, { data: mech }] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url").eq("id", booking.mechanic_id).single(),
      supabase.from("mechanics").select("rating").eq("id", booking.mechanic_id).single(),
    ]);
    if (profile) {
      mechanic = {
        name: profile.full_name ?? "Your mechanic",
        avatarUrl: profile.avatar_url ?? null,
        rating: mech?.rating ?? null,
      };
    }
  }

  const ref = formatJobNumber(booking.job_number);
  const slotDate = booking.scheduled_at
    ? formatBookingSlot(booking.scheduled_at, booking.slot_window)
    : null;

  const vehicle = [booking.vehicle_make, booking.vehicle_model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Success header */}
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-green-50">
          <CheckCircle size={32} className="text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Booking confirmed</h1>
          <p className="mt-1 text-text-secondary">
            Ref: <span className="font-bold text-text-primary">{ref}</span>
          </p>
        </div>
      </div>

      {/* Mechanic-proposed reschedule awaiting the customer's response */}
      {booking.reschedule_status === "proposed" && booking.reschedule_proposed_at && (
        <RescheduleProposal
          bookingId={booking.id}
          proposedAt={booking.reschedule_proposed_at}
          currentAt={booking.scheduled_at}
          note={booking.reschedule_note}
        />
      )}

      {/* Live status tracker */}
      <BookingTracker
        bookingId={booking.id}
        status={booking.status}
        mechanic={mechanic}
        createdAt={booking.created_at}
      />

      {/* Booking summary */}
      <Card>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-muted">
          Booking summary
        </h2>
        <dl className="flex flex-col gap-3">
          {booking.customer_name && (
            <Row label="Name" value={booking.customer_name} />
          )}
          <Row label="Vehicle" value={`${booking.vehicle_reg}${vehicle ? ` — ${vehicle}` : ""}`} />
          {slotDate && <Row label="Date & time" value={slotDate} />}
          {booking.address_line_1 && (
            <Row label="Address" value={booking.address_line_1} />
          )}
          <Row
            label={booking.status === "completed" ? "Amount charged" : "Amount pre-authorised"}
            value={formatPrice(booking.total_pence)}
          />
        </dl>
      </Card>

      <Card className="bg-surface">
        <p className="text-sm text-text-secondary leading-relaxed">
          {booking.status === "completed"
            ? "Your payment has now been captured and a receipt has been emailed to you."
            : "No money has left your account. Your payment will only be captured once your mechanic has completed the job."}
        </p>
      </Card>

      <Link href={signedIn ? "/dashboard" : signupHref}>
        <Button variant="secondary" size="lg" fullWidth iconRight={ArrowRight}>
          {signedIn ? "Go to your dashboard" : "Create an account to track your booking"}
        </Button>
      </Link>

      <p className="text-center text-sm text-text-muted">
        Questions?{" "}
        <a href="mailto:help@bookmytech.co.uk" className="font-semibold text-brand-blue hover:underline">
          help@bookmytech.co.uk
        </a>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="text-right font-semibold text-text-primary">{value}</dd>
    </div>
  );
}
