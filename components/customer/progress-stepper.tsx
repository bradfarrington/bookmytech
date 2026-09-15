// Where the customer is in the booking funnel (Task 47), matching the app's
// stepper: a thin track filling left to right, with "Step N · Name" and
// "N of 5" above it. A follow-on quote books only a time and an address, so it
// counts those two alone, as the app does. Confirm has no stepper.

const STEPS = ["Your vehicle", "The job", "Price", "Time", "Address"] as const;
const FOLLOW_ON_STEPS = ["Time", "Address"] as const;

interface ProgressStepperProps {
  /** 1 Vehicle · 2 The job · 3 Price · 4 Time · 5 Address. */
  currentStep: 1 | 2 | 3 | 4 | 5;
  /** A return visit from a follow-on quote: only Time and Address count. */
  followOn?: boolean;
}

export function ProgressStepper({ currentStep, followOn = false }: ProgressStepperProps) {
  const steps: readonly string[] = followOn ? FOLLOW_ON_STEPS : STEPS;
  const position = followOn ? Math.max(1, currentStep - 3) : currentStep;
  const name = steps[position - 1] ?? steps[steps.length - 1];
  const percent = Math.round((position / steps.length) * 100);

  return (
    <nav aria-label="Booking progress" className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[11px] font-bold uppercase tracking-[0.12em]">
        <p className="text-brand-blue">
          Step {position} · {name}
        </p>
        <p className="text-text-muted">
          {position} of {steps.length}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={position}
        aria-valuetext={`Step ${position} of ${steps.length}: ${name}`}
        className="h-1 overflow-hidden rounded-full bg-border-subtle"
      >
        <div
          className="h-full rounded-full bg-brand-blue transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </nav>
  );
}
