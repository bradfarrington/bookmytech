import { ProgressStepper } from "@/components/customer/progress-stepper";
import { StepHeader } from "@/components/customer/step-header";
import { loadCheckoutContext, type CheckoutSearchParams } from "@/lib/bookings/checkout-context";
import { readTimeParams } from "@/lib/bookings/step-params";
import { TimeStep } from "./_components/time-step";

// Step 4 of the funnel (Task 47, matching the app): when the mechanic comes.

interface TimePageProps {
  searchParams: Promise<CheckoutSearchParams & { slot?: string; window?: string; days?: string }>;
}

export default async function TimePage({ searchParams }: TimePageProps) {
  const params = await searchParams;
  const ctx = await loadCheckoutContext(params, "/book/time");
  const time = readTimeParams(params);
  // A quote (a return visit, or a custom quote: Task 75) skips the price step.
  const followOn = Boolean(ctx.base.quote);
  const backHref = ctx.priceHref;
  const title =
    ctx.source === "follow_on"
      ? "When suits you for the return visit?"
      : "When suits you?";

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={4} followOn={followOn} />
      <StepHeader
        backHref={backHref}
        title={title}
        subtitle={`Pick a day and a 2-hour arrival window. ${ctx.summary} · ${ctx.vehicle}`}
      />
      <TimeStep base={ctx.base} initialTime={time} />
    </div>
  );
}
