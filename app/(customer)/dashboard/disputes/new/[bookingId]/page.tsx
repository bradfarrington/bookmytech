import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardHeader } from "../../../_components/dashboard-header";
import { DisputeForm } from "@/components/disputes/dispute-form";

export const dynamic = "force-dynamic";

const WINDOW_MS = 48 * 60 * 60 * 1000;

export default async function NewDisputePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, customer_id, completed_at, total_pence, repair_description")
    .eq("id", bookingId)
    .single();

  // Must be the customer's own, completed, and inside the 48h window.
  const owns = booking?.customer_id === user.id;
  const completedMs = booking?.completed_at ? new Date(booking.completed_at).getTime() : 0;
  const inWindow =
    booking?.status === "completed" && completedMs > 0 && Date.now() - completedMs <= WINDOW_MS;

  // An existing dispute means they should go to it, not open another.
  const { data: existing } = booking
    ? await admin.from("disputes").select("id").eq("booking_id", bookingId).maybeSingle()
    : { data: null };

  if (!booking || !owns) redirect("/dashboard");
  if (existing) redirect(`/dashboard/disputes/${existing.id}`);
  if (!inWindow) redirect("/dashboard");

  const svc = booking.repair_description ?? "Your booking";

  return (
    <div className="min-h-dvh bg-surface">
      <DashboardHeader name={profile?.full_name ?? user.email ?? ""} avatarUrl={profile?.avatar_url ?? null} />
      <main className="mx-auto w-full max-w-content px-4 py-8 sm:px-6">
        <div className="flex max-w-xl flex-col gap-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
          <ArrowLeft size={15} />
          Back to dashboard
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Raise a dispute</h1>
          <p className="text-text-secondary">We&apos;ll work with you and your mechanic to put it right.</p>
        </div>
        <DisputeForm
          bookingId={bookingId}
          role="customer"
          totalPence={booking.total_pence ?? 0}
          serviceName={svc}
          redirectBase="/dashboard/disputes"
        />
        </div>
      </main>
    </div>
  );
}
