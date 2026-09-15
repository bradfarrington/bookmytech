import { redirect } from "next/navigation";
import { ProgressStepper } from "@/components/customer/progress-stepper";
import { StepHeader } from "@/components/customer/step-header";
import { loadCheckoutContext, type CheckoutSearchParams } from "@/lib/bookings/checkout-context";
import { contextKeyFor, readTimeParams, stepQuery } from "@/lib/bookings/step-params";
import { AddressStep } from "./_components/address-step";

// Step 5 of the funnel (Task 47, matching the app): where the mechanic comes.

interface AddressPageProps {
  searchParams: Promise<CheckoutSearchParams & { slot?: string; window?: string; days?: string }>;
}

export default async function AddressPage({ searchParams }: AddressPageProps) {
  const params = await searchParams;
  const ctx = await loadCheckoutContext(params, "/book/address");
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
      <AddressStep base={ctx.base} time={time} context={contextKeyFor(ctx.base)} />
    </div>
  );
}
