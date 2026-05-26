import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Clock, ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ConfirmedPageProps {
  params: Promise<{ id: string }>;
}

export default async function ConfirmedPage({ params }: ConfirmedPageProps) {
  const { id } = await params;
  // Service-role read: guests have no auth session, so the customer-scoped
  // RLS policy on `bookings` wouldn't let them see their own confirmation.
  // Safe because (a) we look up by full UUID, (b) the page surfaces nothing
  // not already in the customer's confirmation email.
  const supabase = createAdminClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, vehicle_reg, vehicle_make, vehicle_model, scheduled_at, total_pence, customer_name, address_line_1, status")
    .eq("id", id)
    .single();

  if (!booking) notFound();

  const ref = booking.id.slice(0, 8).toUpperCase();
  const slotDate = booking.scheduled_at
    ? new Date(booking.scheduled_at).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
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

      {/* Finding mechanic status */}
      <div className="rounded-2xl border border-brand-blue/20 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <div className="relative mt-0.5 shrink-0">
            <Clock size={20} className="text-brand-blue" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-ping rounded-full bg-brand-blue opacity-75" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand-blue" />
          </div>
          <div>
            <p className="font-semibold text-brand-blue">Finding your mechanic</p>
            <p className="mt-1 text-sm text-blue-700 leading-relaxed">
              We&apos;re matching you with the best available mechanic in your area.
              You&apos;ll receive an email confirmation as soon as one accepts —
              usually within minutes.
            </p>
          </div>
        </div>
      </div>

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
          <Row label="Amount pre-authorised" value={formatPrice(booking.total_pence)} />
        </dl>
      </Card>

      <Card className="bg-surface">
        <p className="text-sm text-text-secondary leading-relaxed">
          No money has left your account. Your payment will only be captured once
          your mechanic has completed the job and you&apos;ve signed off.
        </p>
      </Card>

      <Link href="/signup">
        <Button variant="secondary" size="lg" fullWidth iconRight={ArrowRight}>
          Create an account to track your booking
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
