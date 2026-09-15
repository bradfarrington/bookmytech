import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StepHeader } from "@/components/customer/step-header";
import { loadCheckoutContext, type CheckoutSearchParams } from "@/lib/bookings/checkout-context";
import { contextKeyFor, readTimeParams, stepQuery } from "@/lib/bookings/step-params";
import { ConfirmCheckout } from "./_components/confirm-checkout";

// Confirm (Task 47): the last step before the booking is made. Account, discount
// code and payment. The URL stays /book/slot because Stripe returns customers
// here from a 3-D Secure challenge (see confirm-checkout.tsx), and links already
// in the wild point at it.

interface SlotPageProps {
  searchParams: Promise<
    CheckoutSearchParams & {
      slot?: string;
      window?: string;
      days?: string;
      /** Set by Stripe when it returns a customer from a 3-D Secure challenge. */
      payment_intent_client_secret?: string;
    }
  >;
}

export default async function SlotPage({ searchParams }: SlotPageProps) {
  const params = await searchParams;
  const ctx = await loadCheckoutContext(params, "/book/slot");
  const { base, quote } = ctx;
  const time = readTimeParams(params);
  const returnedIntentSecret = params.payment_intent_client_secret;

  // No time chosen yet: back a step. A 3-D Secure return may arrive without the
  // time on the URL, and restores it from the parked draft instead.
  if (!time && !returnedIntentSecret) redirect(`/book/time?${stepQuery(base)}`);

  // Signed-in customers skip the account block; guests fill it in and get an
  // account before the pre-auth. Only a role='customer' session counts as
  // "booking as this account". An admin or mechanic session is asked to sign
  // out instead of silently attaching the job to a staff account.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let availableCreditPence = 0;
  let customerName = "";
  let customerPhone = "";
  let sessionRole: string | null = null;
  if (user) {
    const { availableCreditPence: getCredit } = await import("@/lib/credits/credits");
    const [credit, { data: profile }] = await Promise.all([
      getCredit(createAdminClient(), user.id),
      supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle(),
    ]);
    availableCreditPence = credit;
    customerName = profile?.full_name ?? "";
    customerPhone = profile?.phone ?? "";
    sessionRole = profile?.role ?? "customer";
  }
  const bookingAsCustomer = Boolean(user) && sessionRole === "customer";

  const addressHref = `/book/address?${stepQuery(base, time)}`;

  return (
    <div className="flex flex-col gap-6">
      <StepHeader
        backHref={addressHref}
        title={base.quote ? "Confirm your return visit" : "Confirm booking"}
        subtitle={`${ctx.summary} · ${ctx.vehicle}`}
      />

      <ConfirmCheckout
        base={base}
        contextKey={contextKeyFor(base)}
        initialTime={time}
        timeHref={`/book/time?${stepQuery(base, time)}`}
        addressHref={addressHref}
        priceHref={base.quote ? null : `/book/match?${stepQuery(base)}`}
        reg={base.reg}
        make={(base.make ?? "").toUpperCase()}
        model={base.model}
        quoteId={base.quote}
        repairNodeIds={base.quote ? [] : quote.itemIds}
        repairLines={quote.lines.map(({ nodeId, description, chargedHours, itemId, itemLabel }) => ({
          nodeId,
          description,
          chargedHours,
          itemId,
          itemLabel,
        }))}
        pricePence={quote.breakdown.totalPence}
        preferredMechanicId={base.pref}
        availableCreditPence={bookingAsCustomer ? availableCreditPence : 0}
        signedIn={bookingAsCustomer}
        wrongRole={Boolean(user) && !bookingAsCustomer ? (sessionRole ?? "admin") : undefined}
        customerName={bookingAsCustomer ? customerName : ""}
        customerEmail={bookingAsCustomer ? (user?.email ?? "") : ""}
        customerPhone={bookingAsCustomer ? customerPhone : ""}
        returnedIntentSecret={returnedIntentSecret}
      />
    </div>
  );
}
