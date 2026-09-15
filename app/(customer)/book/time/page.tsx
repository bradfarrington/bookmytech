import { ProgressStepper } from "@/components/customer/progress-stepper";
import { StepHeader } from "@/components/customer/step-header";
import { loadCheckoutContext, type CheckoutSearchParams } from "@/lib/bookings/checkout-context";
import { readTimeParams, stepQuery } from "@/lib/bookings/step-params";
import { TimeStep } from "./_components/time-step";

// Step 4 of the funnel (Task 47, matching the app): when the mechanic comes.

interface TimePageProps {
  searchParams: Promise<CheckoutSearchParams & { slot?: string; window?: string; days?: string }>;
}

export default async function TimePage({ searchParams }: TimePageProps) {
  const params = await searchParams;
  const ctx = await loadCheckoutContext(params, "/book/time");
  const time = readTimeParams(params);
  const followOn = Boolean(ctx.base.quote);
  const backHref = followOn ? `/dashboard/quotes/${ctx.base.quote}` : `/book/match?${stepQuery(ctx.base)}`;

  return (
    <div className="flex flex-col gap-6">
      <ProgressStepper currentStep={4} followOn={followOn} />
      <StepHeader
        backHref={backHref}
        title={followOn ? "When suits you for the return visit?" : "When suits you?"}
        subtitle={`Pick a day and a 2-hour arrival window. ${ctx.summary} · ${ctx.vehicle}`}
      />
      <TimeStep base={ctx.base} initialTime={time} />
    </div>
  );
}
