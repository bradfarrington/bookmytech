import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevisionFor } from "@/lib/revisions/customer";
import { formatJobNumber } from "@/lib/utils";
import { PageHeader, Screen } from "@/components/dashboard/ui";
import { RevisionApproval } from "./_components/revision-approval";

export const dynamic = "force-dynamic";

// The customer reviews a revised job (Task 37): what they booked, what the
// mechanic found instead, and the new price — before the Approve button.
// Signed-in only, like quotes: approving a dearer job authorises money on a
// card, and the hold's ownership is proved through the intent's customer id.
// Task 48: inside the dashboard shell, styled to mockup 04 "Revised job".

export default async function CustomerRevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/revisions/${id}`);

  const owned = await getRevisionFor(id, { userId: user.id, email: user.email ?? null });
  if (!owned.ok) notFound();
  const { revision, booking } = owned;

  const { data: mech } = booking.mechanic_id
    ? await createAdminClient().from("profiles").select("full_name").eq("id", booking.mechanic_id).maybeSingle()
    : { data: null };

  return (
    <Screen>
      <PageHeader title="Revised job" backHref={`/dashboard/bookings/${booking.id}`} />
      <RevisionApproval
        revision={revision}
        bookingRef={formatJobNumber(booking.job_number)}
        bookingStatus={booking.status}
        mechanicName={mech?.full_name ?? "Your mechanic"}
        customerName={booking.customer_name ?? ""}
        customerEmail={booking.customer_email ?? user.email ?? ""}
      />
    </Screen>
  );
}
