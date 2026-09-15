import { redirect } from "next/navigation";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { StepHeader } from "@/components/customer/step-header";
import { listAddresses } from "@/lib/addresses/store";
import type { SavedAddress } from "@/lib/addresses/validate";
import { loadCheckoutContext, type CheckoutSearchParams } from "@/lib/bookings/checkout-context";
import { contextKeyFor, readTimeParams, stepQuery } from "@/lib/bookings/step-params";
import { createClient } from "@/lib/supabase/server";
import { AddressStep } from "./_components/address-step";

// Step 5 of the funnel (Task 47, matching the app): where the mechanic comes.

interface AddressPageProps {
  searchParams: Promise<CheckoutSearchParams & { slot?: string; window?: string; days?: string }>;
}

/**
 * A signed-in customer's saved addresses (Task 49), offered above the form.
 * Anything else (a guest, a staff session, 0072 not applied, a failed read)
 * is an empty list, and the step looks exactly as it did before.
 */
async function savedAddressesForVisitor(): Promise<SavedAddress[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    // Customers only. RLS lets an admin read EVERY customer's addresses, so a
    // staff session must never be offered them as its own.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if ((profile?.role ?? "customer") !== "customer") return [];
    const list = await listAddresses(supabase, user.id);
    return list.ok ? list.addresses : [];
  } catch {
    return [];
  }
}

export default async function AddressPage({ searchParams }: AddressPageProps) {
  const params = await searchParams;
  const [ctx, savedAddresses] = await Promise.all([
    loadCheckoutContext(params, "/book/address"),
    savedAddressesForVisitor(),
  ]);
  const time = readTimeParams(params);
  if (!time) redirect(`/book/time?${stepQuery(ctx.base)}`);

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={5} followOn={Boolean(ctx.base.quote)} />
      <StepHeader
        backHref={`/book/time?${stepQuery(ctx.base, time)}`}
        title="Where should we come?"
        subtitle="Your mechanic works on the car where it's parked, so they need to be able to reach it."
      />
      <AddressStep
        base={ctx.base}
        time={time}
        context={contextKeyFor(ctx.base)}
        savedAddresses={savedAddresses}
      />
    </div>
  );
}
