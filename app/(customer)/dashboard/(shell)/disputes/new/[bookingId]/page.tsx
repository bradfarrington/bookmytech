import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DisputeForm } from "@/components/disputes/dispute-form";
import { PageHeader, Screen, Stack } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

// Raise a dispute about a completed job (Task 48: inside the dashboard shell,
// mockup 04 "Report a problem"). The form is the shared
// components/disputes/dispute-form.tsx, which the mechanic side also uses, so
// it keeps its own look.

const WINDOW_MS = 48 * 60 * 60 * 1000;

/** Completed, and completed no more than 48 hours ago. Outside the component so render stays pure. */
function inDisputeWindow(status: string | undefined, completedAt: string | null | undefined): boolean {
  const completedMs = completedAt ? new Date(completedAt).getTime() : 0;
  return status === "completed" && completedMs > 0 && Date.now() - completedMs <= WINDOW_MS;
}

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

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, customer_id, completed_at, total_pence, repair_description")
    .eq("id", bookingId)
    .single();

  // Must be the customer's own, completed, and inside the 48h window.
  const owns = booking?.customer_id === user.id;
  const inWindow = inDisputeWindow(booking?.status, booking?.completed_at);

  // An existing dispute means they should go to it, not open another.
  const { data: existing } = booking
    ? await admin.from("disputes").select("id").eq("booking_id", bookingId).maybeSingle()
    : { data: null };

  if (!booking || !owns) redirect("/dashboard");
  if (existing) redirect(`/dashboard/disputes/${existing.id}`);
  if (!inWindow) redirect("/dashboard");

  const svc = booking.repair_description ?? "Your booking";

  return (
    <Screen>
      <PageHeader title="Report a problem" backHref={`/dashboard/bookings/${bookingId}`} />
      <Stack>
        <div>
          <h2 className="font-display text-2xl font-extrabold leading-[30px] tracking-[-0.6px] text-text-primary">
            What went wrong?
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">
            We&apos;ll work with you and your mechanic to put it right.
          </p>
        </div>
        <DisputeForm
          bookingId={bookingId}
          role="customer"
          totalPence={booking.total_pence ?? 0}
          serviceName={svc}
          redirectBase="/dashboard/disputes"
        />
      </Stack>
    </Screen>
  );
}
