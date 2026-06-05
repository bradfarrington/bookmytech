import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DisputeForm } from "@/components/disputes/dispute-form";

export const dynamic = "force-dynamic";

export default async function MechanicNewDisputePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  // RLS scopes this to the mechanic's own bookings.
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, mechanic_id, total_pence, service:services(name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.mechanic_id !== user.id) redirect("/mechanic/jobs");
  if (!["en_route", "in_progress", "completed"].includes(booking.status))
    redirect(`/mechanic/jobs/${bookingId}`);

  const { data: existing } = await supabase
    .from("disputes")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) redirect(`/mechanic/disputes/${existing.id}`);

  const svc =
    (Array.isArray(booking.service) ? booking.service[0]?.name : (booking.service as { name?: string } | null)?.name) ??
    "This job";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href={`/mechanic/jobs/${bookingId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
        <ArrowLeft size={15} />
        Back to job
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Raise an issue</h1>
        <p className="text-text-secondary">Flag a problem with this job so we can help resolve it.</p>
      </div>
      <DisputeForm
        bookingId={bookingId}
        role="mechanic"
        totalPence={booking.total_pence ?? 0}
        serviceName={svc}
        redirectBase="/mechanic/disputes"
      />
    </div>
  );
}
