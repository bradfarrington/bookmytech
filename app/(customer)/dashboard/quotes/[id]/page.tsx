import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuoteFor } from "@/lib/quotes/customer";
import { formatJobNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { QuoteApproval } from "./_components/quote-approval";

export const dynamic = "force-dynamic";

// The customer reviews a mechanic's quote (Task 33): every line and the total
// before the Approve button — the T&Cs require the customer to see the
// proposed work and its price before approving. Signed-in only.

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
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <div className="print:hidden">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" iconLeft={ArrowLeft}>
            Back to dashboard
          </Button>
        </Link>
      </div>
      <QuoteApproval
        quote={quote}
        bookingRef={formatJobNumber(booking.job_number)}
        bookingStatus={booking.status}
        mechanicName={mech?.full_name ?? "Your mechanic"}
        customerName={booking.customer_name ?? ""}
        customerEmail={booking.customer_email ?? user.email ?? ""}
      />
    </div>
  );
}
