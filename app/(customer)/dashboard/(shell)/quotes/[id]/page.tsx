import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuoteFor } from "@/lib/quotes/customer";
import { formatBookingSlot } from "@/lib/slots";
import { formatJobNumber } from "@/lib/utils";
import { PageHeader, Screen } from "@/components/dashboard/ui";
import { QuoteApproval } from "./_components/quote-approval";

export const dynamic = "force-dynamic";

// The customer reviews a mechanic's quote (Task 33): every line and the total
// before the Approve button — the T&Cs require the customer to see the
// proposed work and its price before approving. Signed-in only.
// Task 48: inside the dashboard shell, styled to mockup 04 "Quote".

export default async function CustomerQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/quotes/${id}`);

  const owned = await getQuoteFor(id, { userId: user.id, email: user.email ?? null });
  if (!owned.ok) notFound();
  const { quote, booking } = owned;

  const { data: mech } = booking.mechanic_id
    ? await createAdminClient().from("profiles").select("full_name").eq("id", booking.mechanic_id).maybeSingle()
    : { data: null };

  return (
    <Screen>
      <PageHeader title="Quote" backHref={`/dashboard/bookings/${booking.id}`} />
      <QuoteApproval
        quote={quote}
        bookingRef={formatJobNumber(booking.job_number)}
        bookingStatus={booking.status}
        mechanicName={mech?.full_name ?? "Your mechanic"}
        customerName={booking.customer_name ?? ""}
        customerEmail={booking.customer_email ?? user.email ?? ""}
        // Formatted here, in UK time, so the server and browser render the same text.
        expiresLabel={quote.expiresAt ? formatBookingSlot(quote.expiresAt) : null}
      />
    </Screen>
  );
}
